#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { SpliceStack } from "../lib/splice-stack";

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION || "us-east-1",
};

new SpliceStack(app, "SpliceStack", {
  env,
  certificateArn: app.node.tryGetContext("certificateArn"),
  description: "Cutmark - browser-based video editor static hosting",
});
