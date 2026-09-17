import * as path from "path";
import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdaNode from "aws-cdk-lib/aws-lambda-nodejs";
import * as sfn from "aws-cdk-lib/aws-stepfunctions";
import * as tasks from "aws-cdk-lib/aws-stepfunctions-tasks";
import * as apigw from "aws-cdk-lib/aws-apigatewayv2";
import * as apigwIntegrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as iam from "aws-cdk-lib/aws-iam";

export class SpliceStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ---------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------

    // Raw user uploads. Short-lived: source material is deleted once a job
    // finishes, the durable artifacts live in the outputs bucket instead.
    const uploadsBucket = new s3.Bucket(this, "UploadsBucket", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      cors: [
        {
          allowedMethods: [s3.HttpMethods.PUT, s3.HttpMethods.GET],
          allowedOrigins: ["*"], // tighten to your deployed frontend origin
          allowedHeaders: ["*"],
          maxAge: 3000,
        },
      ],
      lifecycleRules: [{ expiration: cdk.Duration.days(1) }],
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
    });

    // Bucket AWS Transcribe writes its raw job output into.
    const transcribeBucket = new s3.Bucket(this, "TranscribeOutputBucket", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      lifecycleRules: [{ expiration: cdk.Duration.days(1) }],
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
    });

    // Processed video, WebVTT captions and scene-marker JSON, served to
    // the browser through CloudFront.
    const outputsBucket = new s3.Bucket(this, "OutputsBucket", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      lifecycleRules: [{ expiration: cdk.Duration.days(7) }],
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
    });

    const originAccessIdentity = new cloudfront.OriginAccessIdentity(this, "OutputsOAI");
    outputsBucket.grantRead(originAccessIdentity);

    const distribution = new cloudfront.Distribution(this, "OutputsDistribution", {
      defaultBehavior: {
        origin: new origins.S3Origin(outputsBucket, { originAccessIdentity }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.CORS_ALLOW_ALL_ORIGINS,
      },
      comment: "Splice processed-media distribution",
    });

    // ---------------------------------------------------------------------
    // Static frontend hosting (Next.js static export)
    // ---------------------------------------------------------------------

    const siteBucket = new s3.Bucket(this, "SiteBucket", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
    });

    const siteOAI = new cloudfront.OriginAccessIdentity(this, "SiteOAI");
    siteBucket.grantRead(siteOAI);

    const siteDistribution = new cloudfront.Distribution(this, "SiteDistribution", {
      defaultRootObject: "index.html",
      defaultBehavior: {
        origin: new origins.S3Origin(siteBucket, { originAccessIdentity: siteOAI }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      // `next export` writes one directory (with an index.html) per route,
      // so a direct request for a missing asset should 404 rather than
      // silently serving the homepage.
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 404, responsePagePath: "/404.html", ttl: cdk.Duration.minutes(5) },
        { httpStatus: 404, responseHttpStatus: 404, responsePagePath: "/404.html", ttl: cdk.Duration.minutes(5) },
      ],
      comment: "Splice static frontend",
    });

    // ---------------------------------------------------------------------
    // Job state
    // ---------------------------------------------------------------------

    const jobsTable = new dynamodb.Table(this, "JobsTable", {
      partitionKey: { name: "jobId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      timeToLiveAttribute: "ttl",
    });

    // ---------------------------------------------------------------------
    // Lambdas - API layer
    // ---------------------------------------------------------------------

    const nodeRuntime = lambda.Runtime.NODEJS_20_X;
    const bundling = { minify: true, sourceMap: true, target: "node20" };

    const presignUploadFn = new lambdaNode.NodejsFunction(this, "PresignUploadFn", {
      entry: path.join(__dirname, "../lambda/presign-upload/index.ts"),
      runtime: nodeRuntime,
      bundling,
      timeout: cdk.Duration.seconds(10),
      environment: { UPLOADS_BUCKET: uploadsBucket.bucketName },
    });
    uploadsBucket.grantPut(presignUploadFn);

    const startJobFn = new lambdaNode.NodejsFunction(this, "StartJobFn", {
      entry: path.join(__dirname, "../lambda/start-job/index.ts"),
      runtime: nodeRuntime,
      bundling,
      timeout: cdk.Duration.seconds(10),
      environment: { JOBS_TABLE: jobsTable.tableName },
    });
    jobsTable.grantWriteData(startJobFn);

    const getJobStatusFn = new lambdaNode.NodejsFunction(this, "GetJobStatusFn", {
      entry: path.join(__dirname, "../lambda/get-job-status/index.ts"),
      runtime: nodeRuntime,
      bundling,
      timeout: cdk.Duration.seconds(10),
      environment: {
        JOBS_TABLE: jobsTable.tableName,
        CLOUDFRONT_DOMAIN: distribution.distributionDomainName,
      },
    });
    jobsTable.grantReadData(getJobStatusFn);

    // ---------------------------------------------------------------------
    // Lambdas - processing pipeline
    // ---------------------------------------------------------------------

    // Trims the clip and runs FFmpeg's content-aware scene filter, packaged
    // as a container image since the ffmpeg binary + fonts exceed the zip
    // Lambda layer's practical size/ergonomics.
    const processVideoFn = new lambda.DockerImageFunction(this, "ProcessVideoFn", {
      code: lambda.DockerImageCode.fromImageAsset(path.join(__dirname, "../lambda/process-video")),
      memorySize: 3008,
      timeout: cdk.Duration.minutes(10),
      environment: {
        UPLOADS_BUCKET: uploadsBucket.bucketName,
        OUTPUTS_BUCKET: outputsBucket.bucketName,
      },
    });
    uploadsBucket.grantRead(processVideoFn);
    outputsBucket.grantWrite(processVideoFn);

    const startTranscriptionFn = new lambdaNode.NodejsFunction(this, "StartTranscriptionFn", {
      entry: path.join(__dirname, "../lambda/start-transcription/index.ts"),
      runtime: nodeRuntime,
      bundling,
      timeout: cdk.Duration.seconds(30),
      environment: {
        UPLOADS_BUCKET: uploadsBucket.bucketName,
        TRANSCRIBE_OUTPUT_BUCKET: transcribeBucket.bucketName,
      },
    });
    uploadsBucket.grantRead(startTranscriptionFn);
    startTranscriptionFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["transcribe:StartTranscriptionJob", "transcribe:GetTranscriptionJob"],
        resources: ["*"],
      })
    );
    transcribeBucket.grantWrite(startTranscriptionFn);

    const checkTranscriptionFn = new lambdaNode.NodejsFunction(this, "CheckTranscriptionFn", {
      entry: path.join(__dirname, "../lambda/start-transcription/check-status.ts"),
      runtime: nodeRuntime,
      bundling,
      timeout: cdk.Duration.seconds(15),
    });
    checkTranscriptionFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["transcribe:GetTranscriptionJob"],
        resources: ["*"],
      })
    );

    const transcriptionCompleteFn = new lambdaNode.NodejsFunction(this, "TranscriptionCompleteFn", {
      entry: path.join(__dirname, "../lambda/transcription-complete/index.ts"),
      runtime: nodeRuntime,
      bundling,
      timeout: cdk.Duration.seconds(30),
      environment: {
        TRANSCRIBE_OUTPUT_BUCKET: transcribeBucket.bucketName,
        OUTPUTS_BUCKET: outputsBucket.bucketName,
        JOBS_TABLE: jobsTable.tableName,
      },
    });
    transcribeBucket.grantRead(transcriptionCompleteFn);
    outputsBucket.grantWrite(transcriptionCompleteFn);
    jobsTable.grantWriteData(transcriptionCompleteFn);

    const combineResultsFn = new lambdaNode.NodejsFunction(this, "CombineResultsFn", {
      entry: path.join(__dirname, "../lambda/combine-results/index.ts"),
      runtime: nodeRuntime,
      bundling,
      timeout: cdk.Duration.seconds(10),
      environment: { JOBS_TABLE: jobsTable.tableName },
    });
    jobsTable.grantWriteData(combineResultsFn);

    const markJobFailedFn = new lambdaNode.NodejsFunction(this, "MarkJobFailedFn", {
      entry: path.join(__dirname, "../lambda/mark-job-failed/index.ts"),
      runtime: nodeRuntime,
      bundling,
      timeout: cdk.Duration.seconds(10),
      environment: { JOBS_TABLE: jobsTable.tableName },
    });
    jobsTable.grantWriteData(markJobFailedFn);

    // ---------------------------------------------------------------------
    // Step Functions - orchestrates trim/scene-detect in parallel with
    // transcription, then merges both results onto the job record.
    // ---------------------------------------------------------------------

    const processVideoTask = new tasks.LambdaInvoke(this, "TrimAndDetectScenes", {
      lambdaFunction: processVideoFn,
      payloadResponseOnly: true,
      resultPath: "$.videoResult",
    });

    const startTranscription = new tasks.LambdaInvoke(this, "StartTranscription", {
      lambdaFunction: startTranscriptionFn,
      payloadResponseOnly: true,
      resultPath: "$.transcription",
    });

    const wait30s = new sfn.Wait(this, "WaitForTranscription", {
      time: sfn.WaitTime.duration(cdk.Duration.seconds(30)),
    });

    const checkTranscription = new tasks.LambdaInvoke(this, "CheckTranscriptionStatus", {
      lambdaFunction: checkTranscriptionFn,
      payloadResponseOnly: true,
      resultPath: "$.transcription",
    });

    const transcriptionComplete = new tasks.LambdaInvoke(this, "ConvertToWebVTT", {
      lambdaFunction: transcriptionCompleteFn,
      payloadResponseOnly: true,
      resultPath: "$.captionsResult",
    });

    const transcriptionFailed = new sfn.Fail(this, "TranscriptionFailed", {
      error: "TranscriptionJobFailed",
      cause: "AWS Transcribe reported a failed job state.",
    });

    const transcriptionBranch = startTranscription
      .next(wait30s)
      .next(checkTranscription)
      .next(
        new sfn.Choice(this, "IsTranscriptionDone")
          .when(sfn.Condition.stringEquals("$.transcription.status", "COMPLETED"), transcriptionComplete)
          .when(sfn.Condition.stringEquals("$.transcription.status", "FAILED"), transcriptionFailed)
          .otherwise(wait30s)
      );

    const markJobFailed = new tasks.LambdaInvoke(this, "MarkJobFailed", {
      lambdaFunction: markJobFailedFn,
      payloadResponseOnly: true,
    });

    const parallel = new sfn.Parallel(this, "TrimAndTranscribeInParallel", {
      resultPath: "$.parallelResult",
    })
      .branch(processVideoTask)
      .branch(transcriptionBranch)
      .addCatch(markJobFailed, { resultPath: "$.error" });

    const combineResults = new tasks.LambdaInvoke(this, "CombineResults", {
      lambdaFunction: combineResultsFn,
      payloadResponseOnly: true,
    }).addCatch(markJobFailed, { resultPath: "$.error" });

    const definition = parallel.next(combineResults);

    const stateMachine = new sfn.StateMachine(this, "SpliceProcessingStateMachine", {
      definitionBody: sfn.DefinitionBody.fromChainable(definition),
      timeout: cdk.Duration.minutes(15),
    });

    // startJob needs to kick off the state machine once it writes the job row
    stateMachine.grantStartExecution(startJobFn);
    startJobFn.addEnvironment("STATE_MACHINE_ARN", stateMachine.stateMachineArn);

    // ---------------------------------------------------------------------
    // HTTP API
    // ---------------------------------------------------------------------

    const httpApi = new apigw.HttpApi(this, "SpliceHttpApi", {
      corsPreflight: {
        allowOrigins: ["*"], // tighten to your deployed frontend origin
        allowMethods: [apigw.CorsHttpMethod.GET, apigw.CorsHttpMethod.POST, apigw.CorsHttpMethod.OPTIONS],
        allowHeaders: ["Content-Type"],
      },
    });

    httpApi.addRoutes({
      path: "/uploads",
      methods: [apigw.HttpMethod.POST],
      integration: new apigwIntegrations.HttpLambdaIntegration("PresignIntegration", presignUploadFn),
    });

    httpApi.addRoutes({
      path: "/jobs",
      methods: [apigw.HttpMethod.POST],
      integration: new apigwIntegrations.HttpLambdaIntegration("StartJobIntegration", startJobFn),
    });

    httpApi.addRoutes({
      path: "/jobs/{jobId}",
      methods: [apigw.HttpMethod.GET],
      integration: new apigwIntegrations.HttpLambdaIntegration("GetJobStatusIntegration", getJobStatusFn),
    });

    // ---------------------------------------------------------------------
    // Outputs
    // ---------------------------------------------------------------------

    new cdk.CfnOutput(this, "SiteBucketName", { value: siteBucket.bucketName });
    new cdk.CfnOutput(this, "SiteDistributionId", { value: siteDistribution.distributionId });
    new cdk.CfnOutput(this, "SiteUrl", { value: `https://${siteDistribution.distributionDomainName}` });
    new cdk.CfnOutput(this, "ApiUrl", { value: httpApi.apiEndpoint });
    new cdk.CfnOutput(this, "CloudFrontDomain", { value: distribution.distributionDomainName });
    new cdk.CfnOutput(this, "UploadsBucketName", { value: uploadsBucket.bucketName });
    new cdk.CfnOutput(this, "OutputsBucketName", { value: outputsBucket.bucketName });
    new cdk.CfnOutput(this, "StateMachineArn", { value: stateMachine.stateMachineArn });
  }
}
