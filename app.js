const express = require("express");
const path = require("path");

const { open } = require("sqlite");
const sqlite3 = require("sqlite3");

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const dbPath = path.join(__dirname, "twitterClone.db");

const app = express();
app.use(express.json());

let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3004, () => {
      console.log("Server Running at http://localhost:3004/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};

initializeDBAndServer();

const objectItemsToArray = (dbObject) => {
  const convertedArray = [];
  dbObject.forEach((username) => convertedArray.push(username.username));
  return { likes: convertedArray };
};

const repliesOfTweetConversion = (dbObject) => {
  const convertedArray = [];
  dbObject.forEach((name) => convertedArray.push(name));
  return { replies: convertedArray };
};

//Register User

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const selectUserQuery = `SELECT *
                         FROM user
                         WHERE username="${username}";`;
  const dbUser = await db.get(selectUserQuery);

  if (dbUser === undefined) {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);
      const createUserQuery = `INSERT INTO user(username, password, name, gender)
                             VALUES(
                                 "${username}",
                                 "${hashedPassword}",
                                 "${name}",
                                 "${gender}");`;
      await db.run(createUserQuery);
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

//Login User

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;

  const selectUserQuery = `SELECT *
                         FROM user
                         WHERE username="${username}";`;
  const dbUser = await db.get(selectUserQuery);

  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "HELLO_MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//Authenticate Token



const authenticateToken = async (request, response, next) => {
  const authHeader = request.headers["authorization"];
  let jwtToken;
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "HELLO_MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

//User Follows

app.post("/user/follow/:followingId", authenticateToken, async (request, response) => {
  let { username } = request;
  const { followingId } = request.params;
  const getUserId = `SELECT user_id
                 FROM user
                 WHERE username="${username}";`;
  const userIdOfUser = await db.get(getUserId);
  const { user_id } = userIdOfUser;
  const followAnotherUser = `INSERT INTO follower(follower_user_id, following_user_id)
                         VALUES(
                             ${user_id},
                             ${followingId}
                             );`;
  await db.run(followAnotherUser);
  response.send("User following created");
});

//User Unfollows

app.delete(
  "/user/unfollow/:followingId/",
  authenticateToken,
  async (request, response) => {
    let { username } = request;
    let { followingId } = request.params;
    followingId=parseInt(followingId)

    const getUserId = `SELECT user_id
                 FROM user
                 WHERE username="${username}";`;
    const userIdOfUser = await db.get(getUserId);
    const { user_id } = userIdOfUser;

    const getUserFollowing = `SELECT following_user_id
                 FROM follower
                 WHERE follower_user_id=${user_id};`;
    const followingIds = await db.all(getUserFollowing);

    const followingIdInFollowerIdorNot = followingIds.some(
      (following) => following.following_user_id === followingId
    );

    if (followingIdInFollowerIdorNot) {
      const unfollowrequestedUser = `DELETE FROM follower
                             WHERE follower_user_id=${user_id} AND following_user_id=${followingId};`;
      
      await db.run(unfollowrequestedUser);
      response.send("Unfollowed a User");
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//GET User Stats

app.get("/userstats/", authenticateToken, async (request, response) => {
  let { username } = request;

  const followingUsersQuery = `SELECT name
                              FROM user  INNER JOIN follower ON user.user_id=follower.follower_user_id
                              WHERE user_id IN (SELECT following_user_id
                                                  FROM user INNER JOIN follower ON user.user_id=follower.follower_user_id
                                                  WHERE username="${username}")
                              GROUP BY user_id`;
  const followingList = await db.all(followingUsersQuery);

  const followersOfUsersQuery = `SELECT name
                              FROM user INNER JOIN follower ON user.user_id=follower.follower_user_id
                              WHERE user_id IN (SELECT follower_user_id
                                                  FROM user INNER JOIN follower ON user.user_id=follower.following_user_id
                                                  WHERE username="${username}")
                              GROUP BY user_id`;
  const followersList = await db.all(followersOfUsersQuery);
  const userStats={username: username, numberOfFollowers: followersList.length, numberOfUserWhomUserFollowing:followingList.length}
  response.send(userStats);
});

//DELETE User Tweets

app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    let { username } = request;
    let { tweetId } = request.params;

    const getUserId = `SELECT user_id
                 FROM user
                 WHERE username="${username}";`;
    const userIdOfUser = await db.get(getUserId);
    const { user_id } = userIdOfUser;

    const getTweetsOfUser = `SELECT tweet_id
                 FROM tweet
                 WHERE user_id=${user_id};`;
    const tweetIds = await db.all(getTweetsOfUser);
    const tweetIdIsUserOrNot = tweetIds.some(
      (tweet) => tweet.tweet_id === parseInt(tweetId)
    );

    if (tweetIdIsUserOrNot) {
      const deleteUserTweetQuery = `DELETE FROM tweet
                             WHERE tweet_id=${tweetId};`;
      await db.run(deleteUserTweetQuery);
      response.send("Tweet Removed");
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//POST A Post in Tweet Table

app.post("/user/tweets/", authenticateToken, async (request, response) => {
  let { username } = request;
  const { tweet } = request.body;
  const getUserId = `SELECT user_id
                 FROM user
                 WHERE username="${username}";`;
  const userIdOfUser = await db.get(getUserId);
  const { user_id } = userIdOfUser;
  const postingTweetQuery = `INSERT INTO tweet(tweet, user_id)
                         VALUES(
                             "${tweet}",
                             ${user_id}
                             );`;
  await db.run(postingTweetQuery);
  response.send("Created a Tweet");
});

//GET List of Whom the user is following

app.get("/user/following/", authenticateToken, async (request, response) => {
  let { username } = request;
  const followingUsersQuery = `SELECT name
                              FROM user  INNER JOIN follower ON user.user_id=follower.follower_user_id
                              WHERE user_id IN (SELECT following_user_id
                                                  FROM user INNER JOIN follower ON user.user_id=follower.follower_user_id
                                                  WHERE username="${username}")
                              GROUP BY user_id`;
  const followingList = await db.all(followingUsersQuery);
  response.send(followingList);
});

//GET List of Followers who are following User

app.get("/user/followers/", authenticateToken, async (request, response) => {
  let { username } = request;
  const followersOfUsersQuery = `SELECT name
                              FROM user INNER JOIN follower ON user.user_id=follower.follower_user_id
                              WHERE user_id IN (SELECT follower_user_id
                                                  FROM user INNER JOIN follower ON user.user_id=follower.following_user_id
                                                  WHERE username="${username}")
                              GROUP BY user_id`;
  const followersList = await db.all(followersOfUsersQuery);
  response.send(followersList);
});

//GET Tweets whom user follows

app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  let { username } = request;
  const tweetsFeedQuery = `SELECT DISTINCT username, tweet, date_time AS dateTime
                              FROM user NATURAL JOIN tweet
                              WHERE user_id IN (SELECT following_user_id
                                                  FROM user INNER JOIN follower ON user.user_id=follower.follower_user_id
                                                  WHERE username="${username}")
                              ORDER BY tweet.date_time DESC
                              LIMIT 4;`;
  const tweetsList = await db.all(tweetsFeedQuery);
  response.send(tweetsList);
});


//GET Tweets Stats of Whom User is Following

app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  let { username } = request;
  let { tweetId } = request.params;
  //First I have written query to check whether tweetId belongs to users who are followed by our user
  const checkTweetIdQuery = `SELECT tweet.tweet_id
                             FROM (user INNER JOIN follower ON user.user_id=follower.follower_user_id) AS T
                             LEFT JOIN tweet ON T.following_user_id=tweet.user_id
                             WHERE user.username="${username}";`;
  const tweetIdsOfFollowing = await db.all(checkTweetIdQuery);
  const isTweetIdIn = tweetIdsOfFollowing.some(
    (tweetIds) => tweetIds.tweet_id === parseInt(tweetId)
  );
  if (isTweetIdIn) {
    //Next I have calculated the counts
    const tweetDetails = `SELECT tweet, COUNT(DISTINCT like.user_id) AS likes, COUNT(DISTINCT reply.reply) AS replies,date_time AS dateTime
                            FROM (tweet LEFT JOIN like ON tweet.tweet_id=like.tweet_id) AS T LEFT JOIN reply ON T.tweet_id=reply.tweet_id 
                            WHERE tweet.tweet_id=${tweetId}
                            GROUP BY tweet.tweet_id;`;
    const tweetStats = await db.get(tweetDetails);
    response.send(tweetStats);
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

//GET Users List who likes requested tweet who user follows

app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    let { username } = request;
    let { tweetId } = request.params;
    //First I have written query to check whether tweetId belongs to users who are followed by our user
    const checkTweetIdQuery = `SELECT tweet.tweet_id
                             FROM (user INNER JOIN follower ON user.user_id=follower.follower_user_id) AS T
                             LEFT JOIN tweet ON T.following_user_id=tweet.user_id
                             WHERE user.username="${username}";`;
    const tweetIdsOfFollowing = await db.all(checkTweetIdQuery);
    const isTweetIdIn = tweetIdsOfFollowing.some(
      (tweetIds) => tweetIds.tweet_id === parseInt(tweetId)
    );
    if (isTweetIdIn) {
      //Next I have calculated counts
      const tweetDetails = `SELECT username
                            FROM like INNER JOIN user ON like.user_id=user.user_id
                            WHERE tweet_id=${tweetId};`;
      const tweetStats = await db.all(tweetDetails);
      response.send(objectItemsToArray(tweetStats));
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//GET Users List who likes requested tweet who user follows

app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    let { username } = request;
    let { tweetId } = request.params;
    //First I have written query to check whether tweetId belongs to users who are followed by our user
    const checkTweetIdQuery = `SELECT tweet.tweet_id
                             FROM (user INNER JOIN follower ON user.user_id=follower.follower_user_id) AS T
                             LEFT JOIN tweet ON T.following_user_id=tweet.user_id
                             WHERE user.username="${username}";`;
    const tweetIdsOfFollowing = await db.all(checkTweetIdQuery);
    const isTweetIdIn = tweetIdsOfFollowing.some(
      (tweetIds) => tweetIds.tweet_id === parseInt(tweetId)
    );
    if (isTweetIdIn) {
      //Next I have calculated counts
      const tweetDetails = `SELECT name, reply
                            FROM reply NATURAL JOIN user
                            WHERE tweet_id=${tweetId};`;
      const tweetStats = await db.all(tweetDetails);
      response.send(repliesOfTweetConversion(tweetStats));
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//GET User Tweet Stats

app.get("/user/tweets/", authenticateToken, async (request, response) => {
  let { username } = request;
  const getUserId = `SELECT user_id
                 FROM user
                 WHERE username="${username}";`;
  const userIdOfUser = await db.get(getUserId);
  const { user_id } = userIdOfUser;
  const tweetDetails = `SELECT tweet, COUNT(DISTINCT like.user_id) AS likes, COUNT(DISTINCT reply.reply) AS replies,date_time AS dateTime
                            FROM (tweet LEFT JOIN like ON tweet.tweet_id=like.tweet_id) AS T LEFT JOIN reply ON T.tweet_id=reply.tweet_id 
                            WHERE tweet.user_id=${user_id}
                            GROUP BY tweet.tweet_id
                            ORDER BY tweet.tweet_id;`;
  const tweetStats = await db.all(tweetDetails);
  response.send(tweetStats);
});




module.exports = app;
