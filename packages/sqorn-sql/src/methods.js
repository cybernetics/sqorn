const { snakeCase, memoize } = require('sqorn-util')

/** Initial ctx value */
const newContextCreator = ({ parameter, mapInputKeys = snakeCase }) => {
  const mapKey = memoize(mapInputKeys)
  return ({ arg = [] } = {}) => {
    const whr = []
    return {
      // query type: 'raw' | sql' | 'select' | 'delete' | 'insert' | 'update'
      type: 'select',
      // express syntax status: 'from' | 'where' | 'return'
      express: 'from',
      // saves context needed to interpret proceeding method calls
      // modified by .where, .join.on, .distinct.on and .having
      target: whr,
      // next join target
      nextJoin: { join: 'inner' },
      // current join target, set to ctx.nextJoin on call to .join
      join: undefined,
      // string used to join clauses
      separator: ' ',
      // raw sql args (from .l)
      sql: [],
      // select/returning args
      ret: [],
      // from args
      frm: [],
      // where args
      whr,
      // group by args
      grp: [],
      // having args
      hav: [],
      // union/intersect/except args
      setop: [],
      // order by
      ord: [],
      // with
      with: [],
      // insert args
      ins: [],
      // update/set args
      set: [],
      // limit
      limit: [],
      // offset
      offset: [],
      // parameterized query arguments, initialized to [] but subqueries
      // inherit parent query's arg
      arg,
      // function that parameterizes an argument by adding it to ctx.arg then
      // returning the result text, e.g. '$1', '$2', ..., or '?' for mysql
      parameter,
      // function that maps input keys, e.g. to convert camelCase to snake_case
      mapKey
    }
  }
}

const express = {
  from: (ctx, args) => {
    ctx.frm.push({ type: 'from', args })
    ctx.express = 'where'
  },
  where: (ctx, args) => {
    ctx.whr.push({ type: 'and', args })
    ctx.express = 'return'
  },
  return: (ctx, args) => {
    ctx.ret.push(args)
    ctx.express = 'done'
  },
  done: () => {
    // noop
  }
}

/** Query building methods */
const methods = {
  l: {
    updateContext: (ctx, args) => {
      ctx.type = 'sql'
      ctx.sql.push({ args, raw: false })
    }
  },
  raw: {
    updateContext: (ctx, args) => {
      ctx.type = ctx.type === 'select' ? 'arg' : 'sql'
      ctx.sql.push({ args, raw: true })
    }
  },
  link: {
    updateContext: (ctx, args) => {
      ctx.separator = args[0]
    }
  },
  with: {
    updateContext: (ctx, args) => {
      ctx.with.push(args)
    }
  },
  recursive: {
    getter: true,
    updateContext: ctx => {
      ctx.recursive = true
    }
  },
  from: {
    updateContext: (ctx, args) => {
      ctx.frm.push({ args })
    }
  },
  where: {
    updateContext: (ctx, args) => {
      ctx.whr.push({ type: 'and', args })
      ctx.target = ctx.whr
    }
  },
  and: {
    updateContext: (ctx, args) => {
      ctx.target.push({ type: 'and', args })
    }
  },
  or: {
    updateContext: (ctx, args) => {
      ctx.target.push({ type: 'or', args })
    }
  },
  return: {
    updateContext: (ctx, args) => {
      ctx.ret.push(args)
    }
  },
  distinct: {
    getter: true,
    updateContext: ctx => {
      ctx.target = []
    }
  },
  group: {
    updateContext: (ctx, args) => {
      ctx.grp.push(args)
    }
  },
  having: {
    updateContext: (ctx, args) => {
      ctx.hav.push({ type: 'and', args })
      ctx.target = ctx.hav
    }
  },
  union: {
    updateContext: (ctx, args) => {
      ctx.setop.push({ type: 'union', args })
    },
    properties: {
      all: (ctx, args) => {
        ctx.setop.push({ type: 'union all', args })
      }
    }
  },
  intersect: {
    updateContext: (ctx, args) => {
      ctx.setop.push({ type: 'intersect', args })
    },
    properties: {
      all: (ctx, args) => {
        ctx.setop.push({ type: 'intersect all', args })
      }
    }
  },
  except: {
    updateContext: (ctx, args) => {
      ctx.setop.push({ type: 'except', args })
    },
    properties: {
      all: (ctx, args) => {
        ctx.setop.push({ type: 'except all', args })
      }
    }
  },
  order: {
    updateContext: (ctx, args) => {
      ctx.ord.push(args)
    }
  },
  limit: {
    updateContext: (ctx, args) => {
      ctx.limit = args
    }
  },
  offset: {
    updateContext: (ctx, args) => {
      ctx.offset = args
    }
  },
  join: {
    updateContext: (ctx, args) => {
      ctx.join = ctx.nextJoin
      ctx.join.args = args
      ctx.nextJoin = { join: 'inner' }
      ctx.frm.push(ctx.join)
    }
  },
  left: {
    getter: true,
    updateContext: ctx => {
      ctx.nextJoin.join = 'left'
    }
  },
  right: {
    getter: true,
    updateContext: ctx => {
      ctx.nextJoin.join = 'right'
    }
  },
  full: {
    getter: true,
    updateContext: ctx => {
      ctx.nextJoin.join = 'full'
    }
  },
  cross: {
    getter: true,
    updateContext: ctx => {
      ctx.nextJoin.join = 'cross'
    }
  },
  inner: {
    getter: true,
    updateContext: ctx => {
      ctx.nextJoin.join = 'inner'
    }
  },
  on: {
    updateContext: (ctx, args) => {
      const { join } = ctx
      if (join.on) {
        join.on.push({ type: 'and', args })
      } else {
        ctx.target = join.on = [{ type: 'and', args }]
      }
    }
  },
  using: {
    updateContext: (ctx, args) => {
      const { join } = ctx
      if (join.using) {
        join.using.push(args)
      } else {
        join.using = [args]
      }
    }
  },
  delete: {
    getter: true,
    updateContext: ctx => {
      ctx.type = 'delete'
    }
  },
  insert: {
    updateContext: (ctx, args) => {
      ctx.type = 'insert'
      ctx.ins.push(args)
    }
  },
  value: {
    updateContext: (ctx, args) => {
      ctx.type = 'insert'
      ctx.ins.push(args)
    }
  },
  set: {
    updateContext: (ctx, args) => {
      ctx.type = 'update'
      ctx.set.push(args)
    }
  },
  express: {
    updateContext: (ctx, args) => {
      express[ctx.express](ctx, args)
    }
  }
}

module.exports = {
  newContextCreator,
  methods
}
