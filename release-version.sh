#!/bin/sh

npx semantic-release --branches $(git rev-parse --abbrev-ref HEAD) --no-ci                                                                                                    