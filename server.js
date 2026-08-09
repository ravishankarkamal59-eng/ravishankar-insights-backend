require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const TWOFACTOR_API_KEY = process.env.TWOFACTOR_API_KEY;
const TWOFACTOR_TEMPLATE_NAME = process.env.TWOFACTOR_TEMPLATE_NAME;
const app = express();

app.use(cors());
app.use(express.json());


// ===============================
// ADMIN AUTHENTICATION
// ===============================

const crypto = require("crypto");
const adminTokens = new Set();

function generateAdminToken() {
  return crypto.randomBytes(32).toString("hex");
}

function requireAdmin(req, res, next) {
  const auth = req.headers.authorization || "";

  if (!auth.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message: "Admin login required."
    });
  }

  const token = auth.substring(7);

  if (!adminTokens.has(token)) {
    return res.status(401).json({
      success: false,
      message: "Invalid admin token."
    });
  }

  next();
}

app.post("/api/admin/login", (req, res) => {
  const { username, password } = req.body;

  if (
    username !== process.env.ADMIN_USERNAME ||
    password !== process.env.ADMIN_PASSWORD
  ) {
    return res.status(401).json({
      success: false,
      message: "Username या Password गलत है।"
    });
  }

  const token = generateAdminToken();
  adminTokens.add(token);

  res.json({
    success: true,
    message: "Admin login successful.",
    token
  });
});



// ===============================
// PDF + VIDEO UPLOAD SYSTEM
// ===============================

const uploadsDir = path.join(__dirname, "uploads");

const storage = multer.diskStorage({
  destination: (req, file, cb) => {

    const section = String(req.body.section || "")
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "");

    const allowedSections = [
      "ba",
      "ma",
      "upsc",
      "net-jrf",
      "uppcs",
      "railway",
      "ssc",
      "banking"
    ];

    if (!allowedSections.includes(section)) {
      return cb(new Error("Invalid section"));
    }

    const folder = path.join(uploadsDir, section);

    fs.mkdirSync(folder, { recursive: true });

    cb(null, folder);
  },

  filename: (req, file, cb) => {

    const safeName =
      Date.now() + "-" +
      file.originalname.replace(
        /[^a-zA-Z0-9._-]/g,
        "_"
      );

    cb(null, safeName);
  }
});

const upload = multer({
  storage: storage,

  limits: {
    fileSize: 500 * 1024 * 1024
  },

  fileFilter: (req, file, cb) => {

    const allowed = [
      "application/pdf",
      "video/mp4",
      "video/webm",
      "video/quicktime"
    ];

    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          "Only PDF and video files are allowed."
        )
      );
    }
  }
});

app.use(
  "/uploads",
  express.static(uploadsDir)
);

app.post(
  "/api/admin/upload",
  requireAdmin,
  upload.single("file"),
  (req, res) => {

    try {

      if (!req.file) {

        return res.status(400).json({
          success: false,
          message: "File select करें।"
        });

      }

      const section =
        String(req.body.section || "")
          .toLowerCase();

      res.json({

        success: true,

        message:
          "File successfully upload हो गई।",

        section: section,

        file: {

          name: req.file.originalname,

          type: req.file.mimetype,

          url:
            "/uploads/" +
            section +
            "/" +
            req.file.filename

        }

      });

    } catch (error) {

      console.error(error);

      res.status(500).json({

        success: false,

        message:
          "File upload नहीं हो पाया।"

      });

    }

  }
);
const PORT = 5000;

const articlesFile =
  path.join(__dirname, "articles.json");

const usersFile =
  path.join(__dirname, "users.json");


// ===============================
// FILES CREATE
// ===============================

if (!fs.existsSync(articlesFile)) {
  fs.writeFileSync(articlesFile, "[]");
}

if (!fs.existsSync(usersFile)) {
  fs.writeFileSync(usersFile, "[]");
}


// Temporary OTP storage
const otpStore = {};



// ===============================
// BACKEND CHECK
// ===============================

app.get("/", (req, res) => {

  res.json({
    success: true,
    message:
      "The Ravishankar Insights Backend is running."
  });

});


// ===============================
// ARTICLES GET
// ===============================

app.get("/api/articles", (req, res) => {

  try {

    const articles =
      JSON.parse(
        fs.readFileSync(
          articlesFile,
          "utf8"
        )
      );

    res.json({
      success: true,
      articles: articles
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      success: false,
      message:
        "Articles load नहीं हो पाए।"
    });

  }

});


// ===============================
// ARTICLES SAVE
// ===============================

app.post("/api/articles", requireAdmin, (req, res) => {

  try {

    const {
      title,
      category,
      article
    } = req.body;


    if (!title || !article) {

      return res.status(400).json({

        success: false,

        message:
          "Title और Article जरूरी है।"

      });

    }


    const articles =
      JSON.parse(
        fs.readFileSync(
          articlesFile,
          "utf8"
        )
      );


    const newArticle = {

      id: Date.now(),

      title: title,

      category:
        category || "General",

      article: article,

      createdAt:
        new Date().toISOString()

    };


    articles.push(newArticle);


    fs.writeFileSync(

      articlesFile,

      JSON.stringify(
        articles,
        null,
        2
      )

    );


    res.json({

      success: true,

      message:
        "Article successfully saved.",

      article:
        newArticle

    });


  } catch (error) {

    console.error(error);


    res.status(500).json({

      success: false,

      message:
        "Article save नहीं हो पाया।"

    });

  }

});


// ===============================
// STUDENT SEND OTP
// ===============================

app.post(
  "/api/student/send-otp",
  async (req, res) => {
    console.log("OTP REQUEST RECEIVED");

    try {

      const {
        name,
        mobile,
        email,
        password
      } = req.body;


      if (
        !name ||
        !mobile ||
        !email ||
        !password
      ) {

        return res.status(400).json({

          success: false,

          message:
            "सभी details जरूरी हैं।"

        });

      }


      if (
        !/^[0-9]{10}$/.test(mobile)
      ) {

        return res.status(400).json({

          success: false,

          message:
            "सही 10 digit mobile number डालें।"

        });

      }


      // 6 digit temporary OTP
      const otp =
        Math.floor(
          100000 +
          Math.random() * 900000
        ).toString();


      otpStore[mobile] = {

        otp: otp,

        name: name,

        mobile: mobile,

        email: email,

        password: password,

        expires:
          Date.now() +
          5 * 60 * 1000

      };


      console.log(
        "Student OTP:",
        mobile,
        otp
      );


      try {
        const smsUrl =
          "https://2factor.in/API/V1/" +
          TWOFACTOR_API_KEY +
          "/SMS/" +
          mobile +
          "/" +
          otp +
          "/" +
          encodeURIComponent(TWOFACTOR_TEMPLATE_NAME);

        const smsResponse = await fetch(smsUrl);
        const smsText = await smsResponse.text();
        console.log("2Factor SMS response:", smsText);

        if (!smsResponse.ok || !smsText.includes('"Status":"Success"') ) {
          delete otpStore[mobile];
          return res.status(502).json({
            success: false,
            message: "OTP SMS भेजा नहीं जा सका।"
          });
        }
      } catch (smsError) {
        console.error("SMS error:", smsError);
        delete otpStore[mobile];
        return res.status(502).json({
          success: false,
          message: "OTP SMS भेजा नहीं जा सका।"
        });
      }

      res.json({

        success: true,

        message:
          "OTP generated successfully."

      });


    } catch (error) {

      console.error(error);


      res.status(500).json({

        success: false,

        message:
          "OTP generate नहीं हो पाया।"

      });

    }
  }
);


// ===============================
// VERIFY OTP + REGISTER
// ===============================

app.post(
  "/api/student/verify-otp",
  async (req, res) => {
    console.log("OTP REQUEST RECEIVED");

    try {

      const {
        name,
        mobile,
        email,
        password,
        otp
      } = req.body;


      if (
        !name ||
        !mobile ||
        !email ||
        !password ||
        !otp
      ) {

        return res.status(400).json({

          success: false,

          message:
            "सभी details और OTP जरूरी हैं।"

        });

      }


      const saved =
        otpStore[mobile];


      if (!saved) {

        return res.status(400).json({

          success: false,

          message:
            "पहले OTP request करें।"

        });

      }


      if (
        Date.now() >
        saved.expires
      ) {

        delete otpStore[mobile];


        return res.status(400).json({

          success: false,

          message:
            "OTP expire हो गया है।"

        });

      }


      if (
        saved.otp !== otp
      ) {

        return res.status(400).json({

          success: false,

          message:
            "OTP गलत है।"

        });

      }


      const users =
        JSON.parse(
          fs.readFileSync(
            usersFile,
            "utf8"
          )
        );


      const alreadyExists =
        users.find(
          user =>
            user.email === email
            ||
            user.mobile === mobile
        );


      if (alreadyExists) {

        return res.status(400).json({

          success: false,

          message:
            "इस Email या Mobile से account पहले से मौजूद है।"

        });

      }


      const newUser = {

        id: Date.now(),

        name: name,

        mobile: mobile,

        email: email,

        password: password,

        createdAt:
          new Date().toISOString()

      };


      users.push(newUser);


      fs.writeFileSync(

        usersFile,

        JSON.stringify(
          users,
          null,
          2
        )

      );


      delete otpStore[mobile];


      res.json({

        success: true,

        message:
          "Registration successful.",

        user: {

          id: newUser.id,

          name: newUser.name,

          mobile: newUser.mobile,

          email: newUser.email

        }

      });


    } catch (error) {

      console.error(error);


      res.status(500).json({

        success: false,

        message:
          "Registration नहीं हो पाया।"

      });

    }

  }
);


// ===============================
// STUDENT LOGIN
// ===============================

app.post(
  "/api/student/login",
  async (req, res) => {
    console.log("OTP REQUEST RECEIVED");

    try {

      const {
        email,
        password
      } = req.body;


      if (!email || !password) {

        return res.status(400).json({

          success: false,

          message:
            "Email और Password जरूरी हैं।"

        });

      }


      const users =
        JSON.parse(
          fs.readFileSync(
            usersFile,
            "utf8"
          )
        );


      const user =
        users.find(
          item =>
            item.email === email
            &&
            item.password === password
        );


      if (!user) {

        return res.status(401).json({

          success: false,

          message:
            "Email या Password गलत है।"

        });

      }


      res.json({

        success: true,

        message:
          "Login successful.",

        user: {

          id: user.id,

          name: user.name,

          mobile: user.mobile,

          email: user.email

        }

      });


    } catch (error) {

      console.error(error);


      res.status(500).json({

        success: false,

        message:
          "Login नहीं हो पाया।"

      });

    }

  }
);


// ===============================
// SERVER START
// ===============================


app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

app.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      "The Ravishankar Insights Backend running on http://127.0.0.1:5000"
    );

  }
);

