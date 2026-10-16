<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ yarn install
```

## Compile and run the project

```bash
# development
$ yarn run start

# watch mode
$ yarn run start:dev

# production mode
$ yarn run start:prod
```

## Run tests

```bash
# unit tests
$ yarn run test

# e2e tests
$ yarn run test:e2e

# test coverage
$ yarn run test:cov
```

## Deployment (Google Cloud Run + Neon)

Every release on `main` publishes the image to Docker Hub (unchanged) and, once GCP is set up, the
`deploy-cloud-run` job in `.github/workflows/docker-build.yml` builds a `linux/amd64` image, pushes it
to Artifact Registry, runs the migration Job, then deploys the service at that image digest. The job is
skipped while `vars.GCP_PROJECT_ID` is unset, so CI keeps passing before setup.

### One-time setup (manual)

1. **GCP project**: link a billing account and create a **$1 budget alert**. Enable the Cloud Run,
   Artifact Registry, Secret Manager, IAM Credentials and STS APIs.
2. **Artifact Registry**: a Docker repository in `asia-southeast1`.
3. **Service accounts**:
   - runtime account (used by the service and the Job): `roles/secretmanager.secretAccessor`.
   - deployer account (used by GitHub Actions): `roles/run.admin`, `roles/artifactregistry.writer`, and
     `roles/iam.serviceAccountUser` on the runtime account.
4. **Workload Identity Federation**: a pool + GitHub OIDC provider whose attribute condition pins
   `assertion.repository` to this repo; grant the deployer account `roles/iam.workloadIdentityUser` to
   that principal. No JSON key is stored in GitHub.
5. **Neon**: a free project in the Singapore region. `pg_dump` the current database, restore it, and
   check it fits in 1 GB. Use the **pooled** host with `DATABASE_SSL=true` for the service (the direct
   host is safer for the migration Job).
6. **Secret Manager**: database credentials, `JWT_SECRET`, cookie settings, `TOTP_ENCRYPTION_KEY`, R2
   (`AWS_*`) credentials, and the Google Sheets private key. The key is mounted as a **file** at
   `/usr/src/app/private/secret/google_sheets.key` (config reads it at startup, so the Job needs it too).
7. **Cloud Run service** in `asia-southeast1`: min instances 0, request-based billing, startup probe on
   `/api/v1/health`, env vars and secrets from step 6. Deploy once by hand with any image.
8. **Cloud Run Job** for migrations: same image, same env/secrets, command
   `node node_modules/typeorm/cli.js migration:run -d dist/config/database.config.js`.

### GitHub repository variables

| Variable | Example |
|---|---|
| `GCP_PROJECT_ID` | `my-project` (leave unset to skip deploys) |
| `GCP_REGION` | `asia-southeast1` |
| `GCP_WIF_PROVIDER` | `projects/<number>/locations/global/workloadIdentityPools/<pool>/providers/<provider>` |
| `GCP_SERVICE_ACCOUNT` | deployer account email |
| `AR_REPOSITORY` | Artifact Registry repository name |
| `CLOUD_RUN_SERVICE` | Cloud Run service name |
| `CLOUD_RUN_MIGRATE_JOB` | Cloud Run Job name |

No new GitHub secrets are needed; app secrets live in Secret Manager.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
