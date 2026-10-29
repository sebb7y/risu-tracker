# Risu Tracker

[![Status](https://img.shields.io/badge/status-WIP-yellow?style=flat-square)](#current-todos)
[![AI](https://img.shields.io/badge/AI-assisted-red?style=flat-square)](#dev-instructions)
[![Code quality](https://img.shields.io/badge/code_quality-poor-orange?style=flat-square)](#current-todos)

Yet another (agentically coded) language learning tracker.

<img src="public/risu.svg" alt="Risu squirrel" width="200">

### Why this one?
The primary goal is to support importing data from a ton of different sources (csv immersion logs, anki, hello talk, kakao, line, steam play time etc) to give a more well rounded view of your total time spent learning a language.

The secondary goal is to have pretty looking graphs, heatmaps, statistics, and goal tracking that is highly configurable to what you personally want to see.

The third goal is to run this in a self-hostable web app targeting both desktop and mobile, so you can access it easily from anywhere.

### Current TODOs
- Add more robust data storage/ backend
- Add more robust data importing from all data sources
- Add kakao data source support
- Add LINE data source support
- Expand CSV data source support (TMW immersion logs and a generic CSV format are supported with per-format conversion settings)
- Remove hardcoding from components, making them functionally configurable
- Make components visually configurable
- Enable selection of data source for each component

### Dev instructions
``npm install`` and ``npm run dev``, you know the drill
