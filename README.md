# Water Data For The Nation UI

[![Build Status](https://travis-ci.org/usgs/waterdataui.svg?branch=master)](https://travis-ci.org/usgs/waterdataui)
[![Coverage Status](https://coveralls.io/repos/github/usgs/waterdataui/badge.svg?branch=master)](https://coveralls.io/github/usgs/waterdataui?branch=master)
[![Codacy Badge](https://api.codacy.com/project/badge/Grade/05497ebda0d2450bb11eba0e436f4360)](https://www.codacy.com/app/ayan/waterdataui?utm_source=github.com&amp;utm_medium=referral&amp;utm_content=usgs/waterdataui&amp;utm_campaign=Badge_Grade)
[![BrowserStack Status](https://www.browserstack.com/automate/badge.svg?badge_key=bU1RYk13cEdnTUdmQkd0bzhyODFKNXVIbFdTa216WjdkYkM5UGVlaWNNYz0tLWtnR1ZwZC8rM0diajZXbXVTd1dlRmc9PQ==--0da980361af7531683a3e7245b74bd8bbb7875bc)](https://www.browserstack.com/automate/public-build/bU1RYk13cEdnTUdmQkd0bzhyODFKNXVIbFdTa216WjdkYkM5UGVlaWNNYz0tLWtnR1ZwZC8rM0diajZXbXVTd1dlRmc9PQ==--0da980361af7531683a3e7245b74bd8bbb7875bc)

This repo contains the components of Water Data For The Nation:

- [`wdfn-server`](wdfn-server): A Flask web application that is used to create server-rendered pages for USGS water data
- [`assets`](assets): Client-side Javascript, CSS, images, etc.
- [`graph-server`](graph-server): A node.js server-renderer for charts, serving up SVG and images.

The application has been developed using Python 3.6 and Node.js 10.15.1. This is a work in progress.

## Install dependencies

The repository contains a make target to configure a local development environment:

```bash
make env
```

To manually configure your environment, please see the READMEs of each separate project.

## Development server

To run all development servers in a watch mode at the same time, use the make target:

```bash
make watch
```

... and to run each dev server individually:

```bash
make watch-wdfn
make watch-assets
make watch-graph-server
```

See the specific project READMEs for additional information.

## Run tests

To run all project tests:

```bash
make test
```

## Production build

```bash
make build
```

## Clean targets

```bash
make clean      ; clean build artifacts
make cleanenv   ; clean environment configuration and build artifacts
```

`make` supports chaining targets, so you could also `make clean watch`, etc.
