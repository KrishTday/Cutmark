# GitHub Actions frontend deployment

`.github/workflows/deploy-frontend.yml` builds the static Next.js site and publishes it to S3, then invalidates CloudFront. It runs on pushes to `main` that change `frontend/**` or the deployment workflow. It can also be started from GitHub Actions with **Run workflow**.

## One-time AWS setup

Use GitHub OIDC so Actions receives short-lived AWS credentials; do not create access keys for this workflow.

1. The GitHub OIDC identity provider is configured in AWS.
2. The IAM role `GitHubActions-CutmarkFrontendDeploy` trusts only this repository's `main` branch. GitHub's OIDC settings show immutable subject claims for this repo; the trust policy uses `repo:KrishTday@107617105/Cutmark@1374972396:ref:refs/heads/main`:

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [{
       "Effect": "Allow",
       "Principal": {
         "Federated": "arn:aws:iam::545572979557:oidc-provider/token.actions.githubusercontent.com"
       },
       "Action": "sts:AssumeRoleWithWebIdentity",
       "Condition": {
         "StringEquals": {
           "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
           "token.actions.githubusercontent.com:sub": "repo:KrishTday@107617105/Cutmark@1374972396:ref:refs/heads/main"
         }
       }
     }]
   }
   ```

   The account ID is `545572979557`. If GitHub reports a subject-claim mismatch, check the repository's current OIDC subject format in GitHub's OIDC documentation.

3. The role has a least-privilege policy for the `SpliceStack` outputs: bucket `splicestack-sitebucket397a1860-tv4rpo5uka2` and CloudFront distribution `E3SPZVHOLTEJSK`:

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": "cloudformation:DescribeStacks",
         "Resource": "arn:aws:cloudformation:us-east-1:545572979557:stack/SpliceStack/*"
       },
       {
         "Effect": "Allow",
         "Action": ["s3:ListBucket", "s3:GetBucketLocation", "s3:ListBucketMultipartUploads"],
         "Resource": "arn:aws:s3:::splicestack-sitebucket397a1860-tv4rpo5uka2"
       },
       {
         "Effect": "Allow",
         "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:AbortMultipartUpload", "s3:ListMultipartUploadParts"],
         "Resource": "arn:aws:s3:::splicestack-sitebucket397a1860-tv4rpo5uka2/*"
       },
       {
         "Effect": "Allow",
         "Action": "cloudfront:CreateInvalidation",
         "Resource": "arn:aws:cloudfront::545572979557:distribution/E3SPZVHOLTEJSK"
       }
     ]
   }
   ```

4. The repository secret `AWS_DEPLOY_ROLE_ARN` is configured. It points to `arn:aws:iam::545572979557:role/GitHubActions-CutmarkFrontendDeploy`. No AWS access-key secrets are needed. `AWS_REGION` defaults to `us-east-1` in the workflow.
5. Push a frontend change to `main`. In the repository's **Actions** tab, the **Deploy frontend** workflow builds, uploads, and invalidates the distribution.

The separate **Deploy infrastructure** workflow remains manual and uses `AWS_INFRA_DEPLOY_ROLE_ARN` because CDK infrastructure changes require broader permissions. It is not needed for normal frontend releases.

GitHub and AWS setup references: [GitHub OIDC in AWS](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws), [AWS configure-aws-credentials](https://github.com/aws-actions/configure-aws-credentials).
