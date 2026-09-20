/* hands the browser a blob under `filename` and cleans the object url up */
export const download = (filename: string, blob: Blob) => {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export const downloadJson = (filename: string, data: unknown) =>
  download(filename, new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
