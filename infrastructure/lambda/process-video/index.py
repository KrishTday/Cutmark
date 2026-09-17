"""
Step Functions task Lambda (container image, ffmpeg baked in).

Input:  {"jobId": str, "sourceKey": str, "trimStart": float, "trimEnd": float}
Output: {"outputKey": str, "sceneMarkers": [float, ...]}

Two ffmpeg passes:
  1. Trim [trimStart, trimEnd) and re-encode to a web-friendly H.264/AAC mp4.
  2. Run ffmpeg's content-aware scene filter over the trimmed clip and parse
     the scene-change timestamps out of its stderr log. This is a real,
     deterministic signal-processing technique (frame-to-frame difference
     scoring), not a mocked feature - just not a deep-learning model.
"""

import json
import os
import re
import subprocess
import boto3

s3 = boto3.client("s3")

UPLOADS_BUCKET = os.environ["UPLOADS_BUCKET"]
OUTPUTS_BUCKET = os.environ["OUTPUTS_BUCKET"]

SCENE_THRESHOLD = "0.4"
SCENE_PTS_RE = re.compile(r"pts_time:([0-9]+\.?[0-9]*)")


def run(cmd):
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"Command failed ({cmd[0]}): {result.stderr[-4000:]}")
    return result


def trim_video(input_path: str, output_path: str, trim_start: float, trim_end: float) -> None:
    run([
        "/usr/local/bin/ffmpeg", "-y",
        "-i", input_path,
        "-ss", str(trim_start),
        "-to", str(trim_end),
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
        "-c:a", "aac", "-b:a", "128k",
        "-movflags", "+faststart",
        output_path,
    ])


def detect_scenes(video_path: str) -> list:
    # -f null discards the transcoded output; we only want the showinfo log
    # lines ffmpeg writes to stderr for every frame that passes the filter.
    result = subprocess.run(
        [
            "/usr/local/bin/ffmpeg", "-i", video_path,
            "-filter:v", f"select='gt(scene,{SCENE_THRESHOLD})',showinfo",
            "-f", "null", "-",
        ],
        capture_output=True, text=True,
    )
    timestamps = sorted({round(float(m), 2) for m in SCENE_PTS_RE.findall(result.stderr)})
    return timestamps


def handler(event, _context):
    job_id = event["jobId"]
    source_key = event["sourceKey"]
    trim_start = float(event["trimStart"])
    trim_end = float(event["trimEnd"])

    extension = source_key.rsplit(".", 1)[-1] if "." in source_key else "mp4"
    input_path = f"/tmp/input.{extension}"
    output_path = "/tmp/output.mp4"

    s3.download_file(UPLOADS_BUCKET, source_key, input_path)

    trim_video(input_path, output_path, trim_start, trim_end)
    scene_markers = detect_scenes(output_path)

    output_key = f"{job_id}/output.mp4"
    s3.upload_file(
        output_path, OUTPUTS_BUCKET, output_key,
        ExtraArgs={"ContentType": "video/mp4"},
    )

    return {"outputKey": output_key, "sceneMarkers": scene_markers}
