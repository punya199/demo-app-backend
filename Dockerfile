FROM node:22.19.0-alpine3.21 AS builder

ARG APP_VERSION
ENV APP_VERSION=${APP_VERSION}

ARG APP_BUILD_VERSION
ENV APP_BUILD_VERSION=${APP_BUILD_VERSION}

WORKDIR /usr/src/app

COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn/ ./.yarn/

RUN yarn install --immutable

COPY . .

# build and remove development dependencies
RUN yarn build 

# run node prune
# RUN wget https://gobinaries.com/tj/node-prune --output-document - | /bin/sh && node-prune

# Use the node user from the image (instead of the root user)
USER node

FROM node:22.19.0-alpine3.21 AS runner

ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}

ARG APP_VERSION
ENV APP_VERSION=${APP_VERSION}

ARG APP_BUILD_VERSION
ENV APP_BUILD_VERSION=${APP_BUILD_VERSION}

WORKDIR /usr/src/app

COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn/ ./.yarn/

# Drop Yarn's download cache in the same layer, or it ships in the image
RUN yarn workspaces focus --all --production \
    && rm -rf /root/.yarn /root/.cache /tmp/*

COPY --from=builder /usr/src/app/dist ./dist/
COPY --from=builder /usr/src/app/private ./private/

USER node
EXPOSE 3000
CMD ["node", "dist/main"]
