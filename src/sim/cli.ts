import {
  DEFAULT_SIMULATION_RUNS,
  formatBalanceReport,
  runBalanceSuite,
} from './index'

declare const process: {
  argv: string[]
  exitCode?: number
}

interface CliOptions {
  runs: number
  json: boolean
  help: boolean
}

const HELP = `Free-DH headless simulator

Usage:
  pnpm sim
  pnpm sim -- --runs 500
  pnpm sim -- --runs 100 --json

Options:
  --runs <n>   Simulations per matchup (default: ${DEFAULT_SIMULATION_RUNS})
  --json       Print the complete report as JSON
  --help       Show this help
`

function parseRuns(value: string | undefined): number {
  if (value === undefined) {
    throw new Error('--runs requires a value')
  }

  const runs = Number(value)
  if (!Number.isInteger(runs) || runs <= 0) {
    throw new Error('--runs must be a positive integer')
  }

  return runs
}

function parseArgs(args: readonly string[]): CliOptions {
  let runs = DEFAULT_SIMULATION_RUNS
  let json = false
  let help = false

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!

    if (argument === '--json') {
      json = true
      continue
    }
    if (argument === '--help' || argument === '-h') {
      help = true
      continue
    }
    if (argument === '--runs') {
      runs = parseRuns(args[index + 1])
      index += 1
      continue
    }
    if (argument.startsWith('--runs=')) {
      runs = parseRuns(argument.slice('--runs='.length))
      continue
    }

    throw new Error(`Unknown argument: ${argument}`)
  }

  return { runs, json, help }
}

try {
  const options = parseArgs(process.argv.slice(2))

  if (options.help) {
    console.log(HELP)
  } else {
    const report = runBalanceSuite(options.runs)
    console.log(options.json ? JSON.stringify(report, null, 2) : formatBalanceReport(report))
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  console.error('Run `pnpm sim -- --help` for usage.')
  process.exitCode = 1
}
