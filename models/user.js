const mongoose = require('mongoose'),
    bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
    email: {
        type: String,
        unique: true,
        required: true,
        lowercase: true
    },
    password: {
        type: String,
        required: true
    },
    name: {
        type: String,
        required: true,
        unique: true,
    },
    createdOn: {
        type: Date,
        required: true,
        default: Date.now()
    },
    ipAddress: {
        type: String,
        required: false
    },
    balance: {
        type: Number,
        required: true,
        default: 0
    },
    wins: {
        type: Number,
        required: true,
        default: 0
    },
    losses: {
        type: Number,
        required: true,
        default: 0
    },
    admin: {
        type: Boolean,
        default: false
    },
    active: {
        type: Boolean,
        default: true
    }
});

userSchema.pre('save', function(next) {
    var user = this;

    // only hash the password if it has been modified (or is new)
    if (!user.isModified('password')) return next();

    // generate a salt
    bcrypt.genSalt(10, function(err, salt) {
        if (err) return next(err);

        // hash the password using our new salt
        bcrypt.hash(user.password, salt, function(err, hash) {
            if (err) return next(err);

            // override the cleartext password with the hashed one
            user.password = hash;
            next();
        });
    });
});

userSchema.methods.comparePassword = function(candidatePassword, next) {
    bcrypt.compare(candidatePassword, this.password, function(err, isMatch) {
        if (err) return cb(err);
        next(null, isMatch);
    });
};

module.exports = mongoose.model('User', userSchema);