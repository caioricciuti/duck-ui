# Use an official Node runtime as a parent image with bun
FROM oven/bun:1-alpine AS build

ARG DUCK_UI_BASEPATH="/"

# Set the working directory
WORKDIR /app

# Copy package.json and the lockfile (bun.lock text format, or legacy bun.lockb)
COPY package.json bun.lock* ./

# Install dependencies
RUN bun install --frozen-lockfile

# Bundle app source inside Docker image
COPY . .

# Build the app
RUN DUCK_UI_BASEPATH=${DUCK_UI_BASEPATH} bun run build

# Use a second stage to reduce image size
FROM oven/bun:1-alpine

# Set the working directory for the second stage
WORKDIR /app

# Only dist/ is served. The server, its dependencies and the config files
# stay one level up, out of reach over HTTP.
COPY --from=build /app/dist /app/dist

# Copy the injection script and serve config (COOP/COEP headers for OPFS)
COPY inject-env.js /app/
COPY serve.json /app/

# The static file server, pinned. An unpinned install would pull whatever is
# latest on the day the image is built.
RUN bun add --exact serve@14.2.6

# Expose port 5522
EXPOSE 5522

# Define environment variables
ENV DUCK_UI_EXTERNAL_CONNECTION_NAME=""
ENV DUCK_UI_EXTERNAL_HOST=""
ENV DUCK_UI_EXTERNAL_PORT=""
ENV DUCK_UI_EXTERNAL_USER=""
ENV DUCK_UI_EXTERNAL_PASS=""
ENV DUCK_UI_EXTERNAL_API_KEY=""
ENV DUCK_UI_EXTERNAL_DATABASE_NAME=""

# Create user and change ownership
RUN addgroup -S duck-group -g 1001 && adduser -S duck-user -u 1001 -G duck-group
RUN chown -R duck-user:duck-group /app

USER duck-user

# Run the injection script, then the server installed above. The local binary
# is used directly so nothing can be fetched when the container starts.
CMD DUCK_UI_ENV_DIR=/app/dist bun inject-env.js && ./node_modules/.bin/serve -s dist -l 5522 -c /app/serve.json