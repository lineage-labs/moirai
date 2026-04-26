# Builds the Gensyn AXL node binary from a pinned commit (matches axl-pubsub README pin).
# Build context is this directory only; source is fetched in the builder stage.

FROM golang:1.25-alpine AS builder
RUN apk add --no-cache git ca-certificates
WORKDIR /src
# Pin: https://github.com/gensyn-ai/axl/commit/9cba555ff0b8e14ebf1244ae02b274fbc4ec044e
ARG AXL_REF=9cba555ff0b8e14ebf1244ae02b274fbc4ec044e
RUN git clone https://github.com/gensyn-ai/axl.git axl \
  && cd axl \
  && git checkout "${AXL_REF}"
WORKDIR /src/axl
RUN GOTOOLCHAIN=auto go mod download
RUN GOTOOLCHAIN=auto CGO_ENABLED=0 go build -o /node ./cmd/node/

FROM alpine:3.21
RUN apk add --no-cache ca-certificates
WORKDIR /app
COPY --from=builder /node ./node
EXPOSE 9001 9002
ENTRYPOINT ["./node"]
