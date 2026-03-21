const { queryControlAcks } = require('../models/controlAckModel')

const getControlAckRows = async (query = {}) => {
  return queryControlAcks(query)
}

module.exports = {
  getControlAckRows
}
