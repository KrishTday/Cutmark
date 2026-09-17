#!/bin/bash
# LocalStack initialization script
# This runs automatically when LocalStack starts to set up resources

set -e

echo "Initializing LocalStack..."

# Wait for LocalStack to be ready
sleep 5

# Create S3 buckets
echo "Creating S3 buckets..."
awslocal s3 mb s3://uploads --region us-east-1
awslocal s3 mb s3://outputs --region us-east-1
awslocal s3 mb s3://transcribe-output --region us-east-1

# Create DynamoDB table for jobs
echo "Creating DynamoDB table..."
awslocal dynamodb create-table \
  --table-name jobs \
  --attribute-definitions \
    AttributeName=jobId,AttributeType=S \
  --key-schema \
    AttributeName=jobId,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region us-east-1 || true

echo "LocalStack initialization complete!"
