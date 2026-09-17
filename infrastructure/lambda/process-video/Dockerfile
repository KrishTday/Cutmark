# Statically-linked ffmpeg/ffprobe binaries, copied in below rather than
# installed via a package manager since ffmpeg isn't in Amazon Linux's
# default repos.
FROM mwader/static-ffmpeg:6.1.1 AS ffmpeg

FROM public.ecr.aws/lambda/python:3.12

COPY --from=ffmpeg /ffmpeg /usr/local/bin/ffmpeg
COPY --from=ffmpeg /ffprobe /usr/local/bin/ffprobe

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt --target "${LAMBDA_TASK_ROOT}"

COPY index.py ${LAMBDA_TASK_ROOT}/

CMD ["index.handler"]
