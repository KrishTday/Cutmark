import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as acm from "aws-cdk-lib/aws-certificatemanager";

const SITE_DOMAIN = "cutmark.dev";

interface SpliceStackProps extends cdk.StackProps {
  certificateArn?: string;
}

export class SpliceStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: SpliceStackProps) {
    super(scope, id, props);

    const certificateArn = props?.certificateArn;
    if (certificateArn && !certificateArn.match(/^arn:(aws|aws-us-gov|aws-cn):acm:us-east-1:\d{12}:certificate\/[0-9a-f-]+$/)) {
      throw new Error("The CloudFront certificate must be an ACM certificate ARN from us-east-1.");
    }

    const domainProps = certificateArn
      ? {
          domainNames: [SITE_DOMAIN],
          certificate: acm.Certificate.fromCertificateArn(this, "SiteCertificate", certificateArn),
        }
      : {};

    const siteBucket = new s3.Bucket(this, "SiteBucket", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
    });
    const siteOAI = new cloudfront.OriginAccessIdentity(this, "SiteOAI");
    siteBucket.grantRead(siteOAI);
    const crossOriginIsolation = new cloudfront.ResponseHeadersPolicy(this, "CrossOriginIsolationHeaders", {
      comment: "Enable WebCodecs and shared-memory workers for local video processing.",
      customHeadersBehavior: {
        customHeaders: [
          { header: "Cross-Origin-Opener-Policy", value: "same-origin", override: true },
          { header: "Cross-Origin-Embedder-Policy", value: "require-corp", override: true },
        ],
      },
    });
    const distribution = new cloudfront.Distribution(this, "SiteDistribution", {
      defaultRootObject: "index.html",
      ...domainProps,
      defaultBehavior: {
        origin: new origins.S3Origin(siteBucket, { originAccessIdentity: siteOAI }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: crossOriginIsolation,
      },
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 404, responsePagePath: "/404.html", ttl: cdk.Duration.minutes(5) },
        { httpStatus: 404, responseHttpStatus: 404, responsePagePath: "/404.html", ttl: cdk.Duration.minutes(5) },
      ],
      comment: "Cutmark browser video editor",
    });
    new cdk.CfnOutput(this, "SiteBucketName", { value: siteBucket.bucketName });
    new cdk.CfnOutput(this, "SiteDistributionId", { value: distribution.distributionId });
    new cdk.CfnOutput(this, "CloudFrontDomainName", { value: distribution.distributionDomainName });
    new cdk.CfnOutput(this, "SiteUrl", {
      value: certificateArn ? `https://${SITE_DOMAIN}` : `https://${distribution.distributionDomainName}`,
    });
  }
}
