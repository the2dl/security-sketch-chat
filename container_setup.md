# Installation Guide

## Prerequisites
- Docker and Docker Compose
- Node.js 18+
- PostgreSQL 17+
- Git

## Environment Setup
1. Clone the repository
2. Create a .env file with the following variables:

```
API_KEY=your_api_key
GOOGLE_API_KEY=your_google_api_key
REACT_APP_TIMESKETCH_HOST=http://localhost:5001
TS_HOST=http://localhost:5001
TS_AUTH_MODE=userpass
TS_USERNAME=admin
TS_PASSWORD=your_password
```

## Installation Steps
1. Run the setup script:

```
chmod +x container_setup
./container_setup setup-reset
```

This script will:
- Create required networks and directories
- Start PostgreSQL database
- Initialize schema and tables
- Launch API and frontend services
- Set up Timesketch integration

## Prompts

You can review prompts in the `prompts` directory. These are used to generate analysis from the AI. You can edit these to customize the analysis. Put them in your Admin area of the platform.