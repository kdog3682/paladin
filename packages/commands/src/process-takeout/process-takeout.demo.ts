import { processTakeout } from './process-takeout'

if (import.meta.main) {
  const result = await processTakeout()
  if (!result) console.log('no Takeout/ dir, already processed')
  else console.log(result.youtube.slice(0, 3))
}
