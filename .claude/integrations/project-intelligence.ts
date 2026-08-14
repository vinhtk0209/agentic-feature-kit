#!/usr/bin/env node

export * from './core/project-intelligence'

import { runProjectIntelligenceCli } from './core/project-intelligence'

if (require.main === module) process.exit(runProjectIntelligenceCli())
