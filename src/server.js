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

app.get("/getUser/:user_id", (req, res) => {
  Users.find({
    user_id: req.params.user_id
  }).then(data => {
    if (data.length) {
      res.send(data[0]);
    } else {
      res.send("");
    }
  });
});

app.get("/getDonations/:user_id", (req, res) => {
  Users.find({
    user_id: req.params.user_id
  }).then(data => {
    if (data.length) {
      axios.get(`${DA_URL}/api/v1/alerts/donations`, {
        headers: {
          Authorization: `Bearer ${data[0].accessToken}`
        }
      }).then(_data => {
        let donations = _data.data.data.map(w => {
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
        res.send(donations);
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
      Users.updateOne({
        user_token: req.params.token
      }, {
        $set: {
          user_id: req.params.user_id
        }
      }).then(() => res.send(data[0].username));
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
              socket_token: _data.data.data.socket_connection_token
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
              socket_token: _data.data.data.socket_connection_token
            }).save().then(() => {
              res.redirect(`${REDIRECT}/userToken/${user_token}`);
            });
          }
        });
      });
    });
});