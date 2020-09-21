require('dotenv').config();

const express = require('express');
const app = express();
const passport = require('passport');
const flash = require('express-flash');
const session  = require('express-session');
const methodOverride = require('method-override');
const mongoose = require('mongoose');

// DATABASE
mongoose.connect(process.env.DATABASE_URL, {useNewUrlParser: true});
const db = mongoose.connection;
db.on('error', (error) => console.error(error));
db.once('open', () => console.error("Connected to Database"));

// USER MODEL
const User = require('./models/user.js');

const initializePassport = require('./passport-config');
initializePassport(
    passport, 
    (email, password, done) => getUserByEmail(email, password, done),
    (id, done) => User.findById(id, done)
);

app.set('view-engine', 'ejs');
app.use(express.urlencoded({ extended: false}))
app.use(flash());
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(methodOverride('_method'));

/*          ROUTING            */

app.get('/', checkAuthenticated, (req, res) => {
    res.render('index.ejs', { title: "Rush Poker", name: req.user.name, balance: req.user.balance });

    
});

app.get('/login', checkNotAuthenticated, (req, res) => {
    res.render('login.ejs');
});

app.post('/login', checkNotAuthenticated, passport.authenticate('local', {
    successRedirect: '/',
    failureRedirect: '/login',
    failureFlash: true
}));

app.post('/register', function(req, res) {
    var newUser = new User();

    newUser.email = req.body.email;
    newUser.password = req.body.password;
    newUser.name = req.body.name;
    newUser.ipAddress = req.connection.remoteAddress;
    newUser.balance = req.body.balance;
    newUser.save(function(err, savedUser) {
        if(err)
        {
            console.log(err)
        }
    });

    return res.status(201).send();
});

app.delete('/logout', (req, res) => {
    req.logOut();
    res.redirect('/login');
});


/*      PASSPORT FUNCTIONS      */

function getUserByEmail(email, password, done) {
    console.log("Check email");
    User.findOne({
        email: email
    }, function(err, user) {
        
        // Error
        if (err) return done(err, false, {message: "There was an error while trying to login"});

        // User not found
        if (!user) return done(null, false, {message: "Invalid username"});
        
        // Invalid password
        if(user.password != password) return done(null, false, {message: "Invalid password"});

        return done(null, user);
     });
}

function checkAuthenticated(req, res, next) {
    if(req.isAuthenticated())
        return next();
    
    res.redirect('/login');
}

function checkNotAuthenticated(req, res, next) {
    if (!req.isAuthenticated())
        return next();

    res.redirect('/');
}

app.listen(3000);