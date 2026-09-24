#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { SpliceStack } from "../lib/splice-stack";

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION || "us-east-1",
};
const certificateArn = app.node.tryGetContext("certificateArn");

if (typeof certificateArn !== "string") {
  throw new Error("The ACM certificate ARN for cutmark.dev is required in CDK context (certificateArn).");
}

new SpliceStack(app, "SpliceStack", {
  env,
  certificateArn,
  description: "Cutmark - browser-based video editor static hosting",
});
