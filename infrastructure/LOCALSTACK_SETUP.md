# Cutmark Backend — Local Development Setup

This setup allows you to run the Cutmark frontend and a mock backend locally using Docker Compose.

## What's included

- **Mock API Server**: Node.js server running Lambda function stubs
  - Presigned S3 URL generation
  - Job creation and status tracking
  - In-memory job store (perfect for local testing)
- **Frontend**: Next.js UI (communicates with the local API)

## Quick Start

### 1. Start the full stack

```bash
docker compose up
```

This will start:
- Mock API server on http://localhost:3001
- Frontend on http://localhost:3000

### 2. Open the frontend

Visit **http://localhost:3000** in your browser.

### 3. Try the API

The UI will allow you to:
1. Select a video file
2. Trim in/out points
3. Click "Process clip"

The mock API will:
- Generate a presigned S3 upload URL
- Create a job record in memory
- Return job status when you poll

### 4. Stop the stack

```bash
docker compose down
```

## API Endpoints (running on localhost:3001)

### POST /uploads
Get a presigned S3 upload URL

```bash
curl -X POST http://localhost:3001/uploads \
  -H "Content-Type: application/json" \
  -d '{"fileName": "clip.mp4", "contentType": "video/mp4"}'
```

Response:
```json
{
  "jobId": "abc-123-def",
  "key": "abc-123-def/source/clip.mp4",
  "uploadUrl": "https://mock-s3-presigned-url...",
  "bucket": "uploads"
}
```

### POST /jobs
Start a new job

```bash
curl -X POST http://localhost:3001/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "jobId": "abc-123",
    "key": "uploads/abc-123/source/clip.mp4",
    "trimStart": 5,
    "trimEnd": 10
  }'
```

Response:
```json
{
  "jobId": "abc-123",
  "status": "PROCESSING"
}
```

### GET /jobs/{jobId}
Get job status

```bash
curl http://localhost:3001/jobs/abc-123
```

Response (while processing):
```json
{
  "jobId": "abc-123",
  "status": "PROCESSING",
  "sourceKey": "uploads/abc-123/source/clip.mp4",
  "trimStart": 5,
  "trimEnd": 10,
  "createdAt": "2026-09-17T18:28:29.225Z",
  "updatedAt": "2026-09-17T18:28:29.226Z"
}
```

After ~3 seconds (demo simulation):
```json
{
  "jobId": "abc-123",
  "status": "COMPLETED",
  "videoUrl": "https://...",
  "captionsUrl": "https://...",
  "scenesUrl": "https://..."
}
```

## Project Structure

```
docker-compose.yml              # Compose config for local dev
infrastructure/
  Dockerfile.dev               # Builds the mock API server
  lambda/
    mock-api-server.js         # Express-like HTTP server
    job-store.js               # In-memory job storage
    aws-config.js              # AWS SDK configuration
    presign-upload/index.js    # Presigned URL Lambda stub
    start-job/index.js         # Job creation Lambda stub
    get-job-status/index.js    # Job status Lambda stub
frontend/
  Dockerfile                   # Next.js production build
  .dockerignore
```

## What's being stubbed vs. real

**✓ Real**
- Presigned S3 URL generation (AWS SDK v3)
- API Gateway routing
- In-memory DynamoDB-like job store
- Full frontend UI

**✗ Stubbed for local testing**
- No actual video processing (FFmpeg)
- No actual scene detection
- No AWS Transcribe integration
- Job completion is simulated after 3 seconds
- No S3 object actually uploaded (presigned URL works but S3 is mocked)

## Next Steps

### Add Full LocalStack Integration
To mock **all** AWS services (S3, DynamoDB, Lambda, Step Functions):

1. Install LocalStack
2. Update `docker-compose.yml` to add the `localstack` service
3. Update Lambda handlers to connect to LocalStack endpoints
4. Add bucket/table initialization scripts

See `LOCALSTACK_SETUP.md` in this directory for full instructions.

### Deploy to AWS
When ready to deploy the real backend to AWS:

```bash
cd infrastructure
npm install
aws configure                 # Set up AWS credentials
npx cdk bootstrap             # One-time per region
npx cdk deploy --all
```

See the main README.md for full deployment steps.

## Troubleshooting

**API server fails to start:**
```bash
docker compose logs api
```

**Frontend can't reach API:**
- Ensure `NEXT_PUBLIC_API_URL=http://localhost:3001` is set
- Check that both containers are on the same network: `docker network ls`

**Port conflicts:**
- Frontend port 3000: `lsof -i :3000` (Mac/Linux) or `netstat -ano | findstr :3000` (Windows)
- API port 3001: `lsof -i :3001` (Mac/Linux) or `netstat -ano | findstr :3001` (Windows)
