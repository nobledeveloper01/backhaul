#import "BackhaulFixQueue.h"

#import <sqlite3.h>

@implementation BackhaulFix
@end

@implementation BackhaulFixQueue {
  sqlite3 *_db;
  NSLock *_lock;
}

- (instancetype)init
{
  if (self = [super init]) {
    // One lock around every statement. CoreLocation delivers on the main
    // queue and the TurboModule is called from the JS thread, so inserts and
    // reads genuinely race — and SQLite's own serialised mode is a
    // compile-time setting nobody here controls.
    _lock = [NSLock new];
    [self open];
  }
  return self;
}

- (void)open
{
  NSURL *support = [[[NSFileManager defaultManager] URLsForDirectory:NSApplicationSupportDirectory
                                                           inDomains:NSUserDomainMask] firstObject];
  [[NSFileManager defaultManager] createDirectoryAtURL:support
                           withIntermediateDirectories:YES
                                            attributes:nil
                                                 error:nil];

  NSURL *path = [support URLByAppendingPathComponent:@"backhaul-fixes.db"];

  // Not in anybody's iCloud backup. The directory is the first line of that
  // and this is the second, because the flag survives a file being recreated
  // and an assumption about the directory does not.
  NSURL *mutablePath = [path copy];
  [mutablePath setResourceValue:@YES forKey:NSURLIsExcludedFromBackupKey error:nil];

  if (sqlite3_open([[path path] UTF8String], &_db) != SQLITE_OK) {
    _db = NULL;
    return;
  }

  // WAL, so a read while the service is writing does not block. A three-day
  // trip inserts a fix a minute and the upload loop reads the oldest rows
  // constantly; the default journal serialises those against each other.
  sqlite3_exec(_db, "PRAGMA journal_mode=WAL;", NULL, NULL, NULL);

  const char *schema =
      "CREATE TABLE IF NOT EXISTS fixes ("
      "  id TEXT PRIMARY KEY NOT NULL,"
      "  trip_id TEXT NOT NULL,"
      "  lat REAL NOT NULL,"
      "  lon REAL NOT NULL,"
      "  accuracy REAL NOT NULL,"
      "  at INTEGER NOT NULL,"
      "  speed REAL NOT NULL,"
      "  battery REAL NOT NULL"
      ");"
      "CREATE INDEX IF NOT EXISTS fixes_at ON fixes (at);";
  sqlite3_exec(_db, schema, NULL, NULL, NULL);
}

- (void)insert:(BackhaulFix *)fix
{
  if (_db == NULL) return;

  [_lock lock];
  sqlite3_stmt *statement = NULL;
  // INSERT OR IGNORE: the id is the primary key, so a fix delivered twice is a
  // no-op by construction rather than by a check somebody remembers to write.
  const char *sql =
      "INSERT OR IGNORE INTO fixes (id, trip_id, lat, lon, accuracy, at, speed, battery) "
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?)";

  if (sqlite3_prepare_v2(_db, sql, -1, &statement, NULL) == SQLITE_OK) {
    sqlite3_bind_text(statement, 1, [fix.identifier UTF8String], -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(statement, 2, [fix.tripId UTF8String], -1, SQLITE_TRANSIENT);
    sqlite3_bind_double(statement, 3, fix.lat);
    sqlite3_bind_double(statement, 4, fix.lon);
    sqlite3_bind_double(statement, 5, fix.accuracy);
    sqlite3_bind_int64(statement, 6, fix.at);
    sqlite3_bind_double(statement, 7, fix.speed);
    sqlite3_bind_double(statement, 8, fix.battery);
    sqlite3_step(statement);
  }
  sqlite3_finalize(statement);
  [_lock unlock];
}

- (NSArray<BackhaulFix *> *)peek:(NSInteger)limit
{
  NSMutableArray<BackhaulFix *> *out = [NSMutableArray array];
  if (_db == NULL) return out;

  [_lock lock];
  sqlite3_stmt *statement = NULL;
  const char *sql =
      "SELECT id, trip_id, lat, lon, accuracy, at, speed, battery FROM fixes "
      "ORDER BY at ASC LIMIT ?";

  if (sqlite3_prepare_v2(_db, sql, -1, &statement, NULL) == SQLITE_OK) {
    sqlite3_bind_int(statement, 1, (int)MAX(limit, 1));
    while (sqlite3_step(statement) == SQLITE_ROW) {
      BackhaulFix *fix = [BackhaulFix new];
      fix.identifier = @((const char *)sqlite3_column_text(statement, 0));
      fix.tripId = @((const char *)sqlite3_column_text(statement, 1));
      fix.lat = sqlite3_column_double(statement, 2);
      fix.lon = sqlite3_column_double(statement, 3);
      fix.accuracy = sqlite3_column_double(statement, 4);
      fix.at = sqlite3_column_int64(statement, 5);
      fix.speed = sqlite3_column_double(statement, 6);
      fix.battery = sqlite3_column_double(statement, 7);
      [out addObject:fix];
    }
  }
  sqlite3_finalize(statement);
  [_lock unlock];

  return out;
}

- (NSInteger)acknowledge:(NSArray<NSString *> *)identifiers
{
  if (_db == NULL || identifiers.count == 0) return 0;

  [_lock lock];
  NSInteger removed = 0;
  sqlite3_exec(_db, "BEGIN", NULL, NULL, NULL);

  // Chunked at 500: SQLite's default variable limit is 999, and a device that
  // has been offline for a day acknowledges more than that at once.
  for (NSUInteger offset = 0; offset < identifiers.count; offset += 500) {
    NSRange range = NSMakeRange(offset, MIN(500, identifiers.count - offset));
    NSArray<NSString *> *chunk = [identifiers subarrayWithRange:range];

    NSMutableArray<NSString *> *marks = [NSMutableArray arrayWithCapacity:chunk.count];
    for (NSUInteger i = 0; i < chunk.count; i++) [marks addObject:@"?"];

    NSString *sql = [NSString stringWithFormat:@"DELETE FROM fixes WHERE id IN (%@)",
                                               [marks componentsJoinedByString:@","]];

    sqlite3_stmt *statement = NULL;
    if (sqlite3_prepare_v2(_db, [sql UTF8String], -1, &statement, NULL) == SQLITE_OK) {
      [chunk enumerateObjectsUsingBlock:^(NSString *identifier, NSUInteger index, BOOL *stop) {
        sqlite3_bind_text(statement, (int)index + 1, [identifier UTF8String], -1, SQLITE_TRANSIENT);
      }];
      if (sqlite3_step(statement) == SQLITE_DONE) {
        removed += sqlite3_changes(_db);
      }
    }
    sqlite3_finalize(statement);
  }

  sqlite3_exec(_db, "COMMIT", NULL, NULL, NULL);
  [_lock unlock];

  return removed;
}

- (NSInteger)depth
{
  return [self scalar:"SELECT COUNT(*) FROM fixes" fallback:0];
}

- (long long)lastFixAt
{
  return [self scalar:"SELECT IFNULL(MAX(at), -1) FROM fixes" fallback:-1];
}

- (long long)scalar:(const char *)sql fallback:(long long)fallback
{
  if (_db == NULL) return fallback;

  [_lock lock];
  long long value = fallback;
  sqlite3_stmt *statement = NULL;
  if (sqlite3_prepare_v2(_db, sql, -1, &statement, NULL) == SQLITE_OK) {
    if (sqlite3_step(statement) == SQLITE_ROW) value = sqlite3_column_int64(statement, 0);
  }
  sqlite3_finalize(statement);
  [_lock unlock];

  return value;
}

@end
