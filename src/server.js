const express = require("express");
const axios = require("axios");
const mongoose = require("mongoose");
const cors = require("cors");
const {
  Users
} = require("./users");

const app = express();

const MONGO = process.env.MONGO;
const DA_URL = process.env.DA_URL;
const REDIRECT = process.env.REDIRECT;
const CLIENT_ID = process.env.CLIENT_ID;
const SECRET = process.env.SECRET;
const SCOPE = process.env.SCOPE;
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;

mongoose.connect(MONGO, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  useFindAndModify: false
});

app.use(cors());

app.listen(process.env.PORT || 8080, () => {
  console.log("Server is started :)");
});

const createUUID = () => {
  const pattern = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx";
  return pattern.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

const createDate = () => {
  const date = new Date();
  return (((date.getUTCHours() + 5).toString().length === 1 ? ('0' + (date.getUTCHours() + 5)) : (date.getUTCHours() + 5)) + ':' + (date.getMinutes().toString().length === 1 ? ('0' + date.getMinutes()) : date.getMinutes()) + ':' + (date.getSeconds().toString().length === 1 ? ('0' + date.getSeconds()) : date.getSeconds()) + ' ' + (date.getDate().toString().length === 1 ? ('0' + date.getDate()) : date.getDate()) + '.' + ((date.getMonth() + 1).toString().length === 1 ? ('0' + (date.getMonth() + 1)) : (date.getMonth() + 1)) + '.' + date.getFullYear());
}

app.get("/getUser/:user_id", (req, res) => {
  Users.find({
    user_id: req.params.user_id
  }).then(data => {
    if (data.length) {
      res.send({
        username: data[0].twitch_username
      });
    } else {
      res.send("");
    }
  });
});

app.get("/getDonations/:user_id", (req, res) => {
  Users.find({
    user_id: req.params.user_id
  }).then(data => {
    let result = [];
    if (data.length) {
      const getDonation = (link) => {
        console.log(link);
        axios.get(link, {
          headers: {
            Authorization: `Bearer ${data[0].accessToken}`
          }
        }).then(_data => {
          if (_data.data.links.next) {
            result.concat(_data.data.data);
            getDonation(`${DA_URL}/api/v1/alerts/donations?${(_data.data.links.next).split('?')[1]}`);
          } else {
            result = result.map(w => {
              if (w.currency === "RUB") {
                return {
                  amount: w.amount,
                  username: w.username
                };
              } else if (w.currency === "USD") {
                return {
                  amount: w.amount * 62,
                  username: w.username
                };
              } else if (w.currency === "EUR") {
                return {
                  amount: w.amount * 71,
                  username: w.username
                };
              }
            }).reduce(
              (a, c, i) => (
                a.filter(elem => elem.username === c.username).length === 0 ?
                a.push(c) :
                (a.find(_elem => _elem.username === c.username).amount += c.amount),
                a
              ),
              []
            ).sort((a, b) => b.amount - a.amount).slice(0, 100);
            res.send(result);
          }
      }).catch(e => {
        axios.post(`${DA_URL}/oauth/token`, {
          grant_type: "refresh_token",
          refresh_token: data[0].refreshToken,
          client_id: CLIENT_ID,
          client_secret: SECRET,
          scope: SCOPE
        }).then(_data => {
          Users.updateOne({
            user_id: req.params.user_id
          }, {
            $set: {
              accessToken: _data.data.access_token,
              refreshToken: _data.data.refresh_token,
            }
          }).then(() => res.redirect(`${REDIRECT}/getDonations/${req.params.user_id}`));
        });
      });
      }
      getDonation(`${DA_URL}/api/v1/alerts/donations`);
    } else {
      res.send([]);
    }
  });
});

app.get("/userToken/:user_token", (req, res) => {
  res.send(
    "Insert this token into extension settings: " + req.params.user_token
  );
});

app.get("/userSetToken/:token/:user_id", (req, res) => {
  Users.find({
    user_token: req.params.token
  }).then(data => {
    if (data.length) {
      axios.get(`https://api.twitch.tv/kraken/channels/${req.params.user_id}`, {
        headers: {
          'Client-ID': TWITCH_CLIENT_ID,
          'Accept': 'application/vnd.twitchtv.v5+json'
        }
      }).then(twitch_data => {
        Users.updateOne({
          user_token: req.params.token
        }, {
          $set: {
            user_id: req.params.user_id,
            twitch_username: twitch_data.data.name,
            followers: twitch_data.data.followers,
            views: twitch_data.data.views
          }
        }).then(() => res.send(twitch_data.data.name));
      });
    } else {
      res.send("");
    }
  });
});

app.get("/callback", (req, res) => {
  axios.post(`${DA_URL}/oauth/token`, {
      grant_type: "authorization_code",
      client_id: CLIENT_ID,
      client_secret: SECRET,
      redirect_uri: `${REDIRECT}/callback`,
      code: req.query.code
    })
    .then(data => {
      axios.get(`${DA_URL}/api/v1/user/oauth`, {
        headers: {
          Authorization: `Bearer ${data.data.access_token}`
        }
      }).then(_data => {
        const user_token = createUUID();
        Users.find({
          username: _data.data.data.name
        }).then(datauser => {
          if (datauser.length) {
            Users.findOneAndUpdate({
              username: _data.data.data.name
            }, {
              user_id: datauser[0].user_id,
              username: _data.data.data.name,
              accessToken: data.data.access_token,
              refreshToken: data.data.refresh_token,
              user_token: user_token,
              mail: _data.data.data.email,
              socket_token: _data.data.data.socket_connection_token,
              twitch_username: datauser[0].twitch_username || "",
              followers: datauser[0].followers || "",
              views: datauser[0].views || "",
              date: datauser[0].date || ""
            }).then(() => {
              res.redirect(`${REDIRECT}/userToken/${user_token}`);
            });
          } else {
            const user = new Users({
              user_id: "",
              username: _data.data.data.name,
              accessToken: data.data.access_token,
              refreshToken: data.data.refresh_token,
              user_token: user_token,
              mail: _data.data.data.email,
              socket_token: _data.data.data.socket_connection_token,
              twitch_username: "",
              followers: "",
              views: "",
              date: createDate()
            }).save().then(() => {
              res.redirect(`${REDIRECT}/userToken/${user_token}`);
            });
          }
        });
      });
    });
});