#!/usr/bin/env node

export * from '../../packages/core/src/project-intelligence'

import { runProjectIntelligenceCli } from '../../packages/core/src/project-intelligence'

if (require.main === module) process.exit(runProjectIntelligenceCli())
