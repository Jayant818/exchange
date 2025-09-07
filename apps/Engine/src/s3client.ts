import { S3Client } from "@aws-sdk/client-s3";

// This automatically reads AWS credentials from environment variables
export const s3Client = new S3Client({
  region: process.env.AWS_REGION || "ap-south-1",
});
