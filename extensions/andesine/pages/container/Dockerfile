# One image per Pages template version: the template, installed, and the build server.
FROM node:24-bookworm-slim

ARG TEMPLATE_VERSION
ENV ASTRO_TELEMETRY_DISABLED=1

RUN npx --yes "andesine@${TEMPLATE_VERSION}" pages init /site \
  && cd /site \
  && npm install --no-audit --no-fund

COPY server.mjs /server.mjs

EXPOSE 8080
CMD ["node", "/server.mjs"]
