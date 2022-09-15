## Drone Cache Config Plugin

This [Drone](https://drone.io) converter plugin automatically adds cache restore or rebuild before and after the steps in a pipeline.  It will work with the [drone-cache](https://github.com/meltwater/drone-cache) plugin and will work out of the box with the following package manager caches:

* composer
* npm
* yarn
* pip
* gradle
* maven
* dotnetcore
* ivy2
* sbt

### Running

This plugin is available on [Docker Hub](https://hub.docker.com/r/goodwillaz/drone-convert-plugin-cache) or you can optionally build and host yourself.

```bash
$ docker build --rm -t <your-repo>/drone-convert-plugin-cache:latest .
$ docker push <your-repo>/drone-convert-plugin-cache:latest
```

### Usage

#### Docker Compose

(Necessary config portion shown only)

```yaml
services:
  drone-server:
    ...
    environment:
      - DRONE_CONVERT_PLUGIN_ENDPOINT=http://drone-convert-plugin-cache:3000
      - DRONE_YAML_SECRET=${CONVERT_SECRET:?CONVERT_SECRET is required}
      ...
    depends_on:
      - drone-convert-plugin-cache
      ...
  
  drone-convert-plugin-cache:
    image: ghcr.io/goodwillaz/drone-convert-plugin-cache:latest
    environment:
      - PLUGIN_SECRET=${YAML_SECRET:?YAML_SECRET is required}
      - CACHE_BACKEND=filesystem
      - CACHE_ARCHIVE_FORMAT=gzip
```

#### .drone.yml file

You can add a `caches` option to any step in your pipeline in your .drone.yml to indicate the caches to use for that step

```yaml
---
steps:
  - name: build
    image: node:16-alpine
    caches:
      - npm
    commands:
      - npm ci
```

### Environment Variable Support

Here's a full list of environment variables supported by the plugin:

* PLUGIN_SECRET (required)
* PLUGIN_HOST (default: 0.0.0.0)
* PLUGIN_PORT (default: 3000)
* PLUGIN_DEBUG - (default: false)
* CACHE_ - any environment variable beginning with `CACHE_` is updated to `PLUGIN_` and passed through to the actual cache plugin

### Pipeline Support

This plugin supports [goodwillaz/drone-convert-pipeline](https://github.com/goodwillaz/drone-convert-pipeline).

### License

See the [LICENSE](LICENSE.md) file for license rights and limitations (BSD 3-clause).
