FROM node:20.18.1-alpine AS builder

WORKDIR /usr/src/app

COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn/ ./.yarn/

RUN --mount=type=cache,target="/root/.yarn" yarn install --immutable

COPY . .

# build and remove development dependencies
RUN yarn build 

# run node prune
# RUN wget https://gobinaries.com/tj/node-prune --output-document - | /bin/sh && node-prune

# Use the node user from the image (instead of the root user)
USER node

FROM node:20.18.1-alpine AS runner

ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}

WORKDIR /usr/src/app

RUN corepack enable \
    && yarn set version berry \
    && yarn config set nodeLinker node-modules \
    && yarn

COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn/ ./.yarn/

RUN --mount=type=cache,target="/root/.yarn" yarn workspaces focus --all --production

COPY --from=builder /usr/src/app/dist ./dist/

EXPOSE 3000
CMD ["node", "dist/main"]
