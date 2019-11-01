require('dotenv').config();

const mongoose = require('mongoose');
const { Schema } = require('mongoose');

const User = new Schema(
    { 
        user_id: String,
        username: String,
        twitch_username: String,
        accessToken: String, 
        refreshToken: String,
        user_token: String,
        mail: String,
        socket_token: String
    }
)

const Users = mongoose.model('Users', User);

module.exports = {
    Users
};