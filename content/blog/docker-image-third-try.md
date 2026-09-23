---
title: Docker image published on the third try
date: 2026-09-18
summary: The orbi image reached GHCR and Docker Hub on the third publish run. Three earlier failures came from build context, Dockerfile paths, and an invalid image tag.
lang: en
author: Orbi
image: /img/blog-docker-image.png
---

Issue [#1031](https://github.com/orbi-build/orbi/issues/1031) asked for the obvious thing: the container that `3rd/docker/Dockerfile` already builds should be published, so a Docker search lands on something real. The workflow now publishes on every release and on a manual dispatch: `linux/amd64` and `linux/arm64`, tagged with the release version and `latest`, to both `ghcr.io/orbi-build/orbi` and `docker.io/orbibuild/orbi`.

Pull the published image:

```bash
docker pull ghcr.io/orbi-build/orbi:latest
docker pull docker.io/orbibuild/orbi:latest
```

The docs walk from pull to a first delivered Issue: [docs.orbi.build/docker](https://docs.orbi.build/docker). The Hub overview lives at [hub.docker.com/r/orbibuild/orbi](https://hub.docker.com/r/orbibuild/orbi).

## Three failures, three different causes

All of this happened on 2026-09-17, the day the workflow shipped with release v0.5.17. Each failure left a fix behind, and each fix is a public pull request.

### Try 1 (release v0.5.17): two jobs, two build contexts

The build-only verify job built the image fine; the publish job failed. Buildx could not find `/orbi-container-setup.sh` and `/orbi-container-setup.service`, the files the Dockerfile copies. The verify job pointed at the right directory; the publish job pointed at another context, so its build started from a view of the repository that was missing exactly those files.

### Try 2 (manual dispatch): the Dockerfile path resolved from the workspace root

Run [35215809993](https://github.com/orbi-build/orbi/actions/runs/35215809993) failed all three build steps with `failed to read dockerfile: open Dockerfile: no such file or directory`. [#1044](https://github.com/orbi-build/orbi/pull/1044) names the cause: buildx resolves `file: Dockerfile` against the workspace root, so the fix wrote `3rd/docker/Dockerfile` in all three places. The fix's own pull-request checks then failed from the other side: the workflow derived the image tag from the git ref, and a pull request's ref is `1044/merge`, which buildx rejects as `invalid reference format`.

### Try 3 (manual dispatch): the images landed; the overview step kept the job red

Run [35216638306](https://github.com/orbi-build/orbi/actions/runs/35216638306) pushed `0.5.17` and `latest` to both registries, for `linux/amd64` and `linux/arm64`. The job still ended red: the only failing step was the Docker Hub overview update, answered 403 because the token lacked a permission. [#1046](https://github.com/orbi-build/orbi/pull/1046) made that step `continue-on-error: true`, so an overview hiccup can never fail a release again.

## Three rules the failures bought

### Rule 1: every build spells out its paths

Each build step now carries `context: 3rd/docker` and `file: 3rd/docker/Dockerfile`. Nothing depends on the working directory buildx happens to start from.

### Rule 2: publish never runs on a PR ref

The build-only job runs on pull requests and builds under a `pr-<n>` tag with `push: false`; the publish job is gated on the event name. A ref like `1044/merge` can no longer reach a tag.

### Rule 3: an overview cannot fail a release

The Docker Hub overview step runs with `continue-on-error: true`. The release contract lives in the images; a description update answered 403 cannot turn a finished publish into a failed run.

Checked against `.github/workflows/docker-image.yml` on orbi-build/orbi main, 2026-09-18.

## From pull to first delivery

A pulled image still needs a model provider before it can deliver. [#1048](https://github.com/orbi-build/orbi/issues/1048) added the `ORBI_PI_*` environment variables: with `ORBI_PI_PROVIDER`, `ORBI_PI_MODEL`, `ORBI_PI_BASE_URL` and `ORBI_PI_API_KEY` set, the entrypoint generates `pi-providers.json` on first start, and it never touches an existing configuration. [#1049](https://github.com/orbi-build/orbi/issues/1049) rewrote the Quick start around that: `docker pull`, then one copy-pasted `docker run` that reaches a real delivery, with build-from-source moved to its own section.

The first release after the fixes, v0.5.18, published green end to end. That is the state the next release inherits.

## Pull the image, create an Issue, get a PR

The Quick start on [docs.orbi.build/docker](https://docs.orbi.build/docker) takes you from `docker pull` to a first delivery. The image overview lives on [hub.docker.com/r/orbibuild/orbi](https://hub.docker.com/r/orbibuild/orbi).
