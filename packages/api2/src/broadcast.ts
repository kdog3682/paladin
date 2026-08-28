type Client = {
  send(data: string): void
}

export type Broadcast<T> = ReturnType<typeof createBroadcast<T>>

export function createBroadcast<T>() {
  const clients = new Set<Client>()

  return {
    add(client: Client) {
      clients.add(client)
    },

    remove(client: Client) {
      clients.delete(client)
    },

    /** Send to every connected client, dropping any that fail. */
    send(message: T) {
      const payload = JSON.stringify(message)
      for (const client of clients) {
        try {
          client.send(payload)
        } catch {
          clients.delete(client)
        }
      }
    },

    get size() {
      return clients.size
    },
  }
}
