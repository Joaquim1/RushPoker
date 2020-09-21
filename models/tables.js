const mongoose = require('mongoose');

const tablesSchema = new mongoose.Schema({
    Name: {
        type: String,
        required: true,
    },
    Description: {
        type: String,
        required: true
    },
    bigBlind: {
        type: Number,
        default: 2
    },
    smallBlind: {
        type: Number,
        default: 1
    },
    minBuyIn: {
        type: Number,
        default: 60
    },
    maxBuyIn: {
        type: Number,
        default: 300
    },
    minPlayers: {
        type: Number,
        default: 2,
    },
    maxPlayers: {
        type: Number,
        default: 10
    },
    startTime: {
        type: Date,
        default: Date.now()
    },
    rakeMinPreflopPot: {
        type: Number,
        default: 20
    },
    rakePreflopPot: {
        type: Number,
        default: 1
    },
    rakePostflopPercent: {
        type: Number,
        default: 5,
    },
    rakePostflopMax: {
        type: Number,
        default: 6
    },
    timeBank: {
        type: Number,
        default: 120
    },
    rakeTotal: {
        type: Number,
        default: 0,
    },
    raiseBlinds: {
        type: Number,
        default: 0
    },
    active: {
        type: Boolean,
        default: true
    }
});

module.exports = mongoose.model('Tables', tablesSchema);