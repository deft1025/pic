FROM golang:1.25-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY cmd ./cmd
COPY internal ./internal
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/pic ./cmd/api && \
    CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/dbinit ./cmd/dbinit && \
    CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/importer ./cmd/importer

FROM alpine:3.22
RUN apk add --no-cache ca-certificates && addgroup -S pic && adduser -S pic -G pic
WORKDIR /app
COPY --from=build /out/ /app/
COPY --chown=pic:pic web/index.html web/app.js web/styles.css web/favicon.svg /app/web/
COPY --chown=pic:pic web/assets/hero.svg /app/web/assets/hero.svg
COPY --chown=pic:pic content/books /app/content/books
COPY --chown=pic:pic docs/schema.sql /app/docs/schema.sql
USER pic
ENV HTTP_ADDR=0.0.0.0:8198
EXPOSE 8198
CMD ["/app/pic"]
