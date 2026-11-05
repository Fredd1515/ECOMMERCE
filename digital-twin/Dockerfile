FROM nodered/node-red:latest

# Keep the working directory used by the official Node-RED image so its
# entrypoint starts Node-RED with the image's own package configuration.
WORKDIR /usr/src/node-red

# Keep the runtime configuration and flows in the image so a free Render
# instance can be recreated safely after a restart or spin-down.
COPY settings.js /data/settings.js
COPY flows.json /data/flows.json

ENV FLOWS=flows.json
EXPOSE 1880

