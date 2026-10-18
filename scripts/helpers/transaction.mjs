export function transaction(database, operation) {
  database.exec('BEGIN IMMEDIATE')

  try {
    const value = operation()

    database.exec('COMMIT')

    return value
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }
}
