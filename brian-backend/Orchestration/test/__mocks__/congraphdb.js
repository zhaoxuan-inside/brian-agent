// Mock for congraphdb native module (not available on Linux)
class MockConnection {
  exec() { return { columns: [], rows: [] }; }
  query() { return []; }
  close() {}
}

class MockDatabase {
  createConnection() { return new MockConnection(); }
  exec() { return { columns: [], rows: [] }; }
  query() { return []; }
  close() {}
}

module.exports = {
  Database: MockDatabase,
  Connection: MockConnection,
  QueryResult: function() {},
  CongraphDBAPI: function() {},
  NodeAPI: function() {},
  EdgeAPI: function() {},
  Navigator: function() {},
  Variable: function() {},
  SchemaAPI: function() {},
  Pattern: function() {},
  CypherBuilder: function() {},
  VectorStore: function() {
    return {
      add: () => {},
      search: () => [],
      dimension: () => 0,
      remove: () => {},
      close: () => {},
    };
  },
  createVectorStore: () => ({
    add: () => {},
    search: () => [],
    dimension: () => 0,
    remove: () => {},
    close: () => {},
  }),
  PropertyTypes: {},
  QueryResultEnhanced: function() {},
};
