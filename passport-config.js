const localStrategy = require('passport-local').Strategy;

async function initialize(passport, getUserByEmail, getUserById) {
    
    passport.use(new localStrategy({usernameField: "email"}, getUserByEmail));

    passport.serializeUser((user, done) => { done(null, user.id) });
    passport.deserializeUser((id, done) => getUserById(id, done));
}

module.exports = initialize;