#!/usr/bin/env node

export * from './core/stack-portability'

import { runStackPortabilityCli } from './core/stack-portability'

if (require.main === module) process.exit(runStackPortabilityCli())
