pipeline {
    agent { label 'slave' }

    tools {
        nodejs 'nodejs-20.18.1'
    }

    environment {
        REGISTRY_CREDENTIALS = 'docker-hub-credentials'
        DOCKER_REGISTRY = "docker.io"
        DOCKER_IMAGE = "${DOCKER_REGISTRY}/acelectic/yaya-developer"
        GIT_COMMIT_VERSION = "${env.GIT_COMMIT}"
        GITHUB_TOKEN = credentials('github-ya')
        BRANCH_NAME = "${env.BRANCH_NAME}"
        // Add Node.js memory optimization
        NODE_OPTIONS = "--max-old-space-size=2048"
        // Optimize Yarn for CI
        YARN_CACHE_FOLDER = "${WORKSPACE}/.yarn/cache"
        YARN_ENABLE_GLOBAL_CACHE = "false"
    }

    stages {
        stage('Install') {
            when {
                anyOf {
                    branch 'main'
                    changeRequest target: 'main', comparator: 'GLOB'
                }
            }
            steps {
                scmSkip(deleteBuild: false)
                cache(maxCacheSize: 1000, defaultBranch: 'main', caches: [
                  arbitraryFileCache(
                    path: '.yarn/cache', 
                    cacheName: 'yarn-berry-cache', 
                    cacheValidityDecidingFile: 'yarn.lock'
                  ),
                  arbitraryFileCache(
                      path: 'node_modules',
                      cacheName: 'node-modules-cache',
                      cacheValidityDecidingFile: 'yarn.lock'
                  )
                ]) {
                  // Add network timeout and retry options
                  sh '''
                    yarn install --immutable 
                  '''
                }
            }
        }

        stage('Lint') {
            when {
                anyOf {
                  branch 'main'

                  changeRequest target: 'main', comparator: 'GLOB'
                }
            }
            steps {
                script {
                    sh 'yarn lint:ci'
                }
            }
        }


        stage('Release TAG Version') {
            when {
                branch 'main'
            }
            steps {
                script {
                    sh 'npx semantic-release'
                    env.TARGET_TAG = sh(script:'cat VERSION || echo ""', returnStdout: true).trim()
                }
            }
        }

        stage('Release Image') {
            when {
                branch 'main'
            }
            steps {
                script {
                    env.APP_VERSION = env.TARGET_TAG
                    sh "echo env.APP_VERSION=${env.APP_VERSION}"
                    env.APP_BUILD_VERSION = env.GIT_COMMIT_VERSION
                    sh "echo env.APP_BUILD_VERSION=${env.APP_BUILD_VERSION}"

                    def dockerImageName = "${DOCKER_IMAGE}:demo-app-backend"
                    docker.build(dockerImageName, "-f Dockerfile --build-arg APP_VERSION=${env.APP_VERSION} --build-arg APP_BUILD_VERSION=${env.GIT_COMMIT_VERSION} .")
                   
                    docker.withRegistry('https://index.docker.io/v1/', REGISTRY_CREDENTIALS) {
                        dockerImage = docker.image(dockerImageName)
                        dockerImage.push()
                    }
                }
            }
        }
    }
    post {
        always {
            deleteDir()
        }
    }
}