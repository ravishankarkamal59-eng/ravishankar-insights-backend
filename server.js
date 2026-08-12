require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const cookieParser = require("cookie-parser");
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const TWOFACTOR_API_KEY = process.env.TWOFACTOR_API_KEY;
const TWOFACTOR_TEMPLATE_NAME = process.env.TWOFACTOR_TEMPLATE_NAME;
const app = express();

app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());


// ===============================
// ADMIN AUTHENTICATION
// ===============================

const crypto = require("crypto");
const adminTokens = new Set();

// STUDENT SESSION AUTHENTICATION
const studentSessions = new Map();

function generateStudentSession() {
  return crypto.randomBytes(32).toString("hex");
}

function requireStudent(req, res, next) {

  const auth =
    req.headers.authorization || "";

  let token = "";

  if (auth.startsWith("Bearer ")) {
    token = auth.substring(7);
  }

  if (!token) {
    token =
      req.cookies.studentSession || "";
  }

  if (!token || !studentSessions.has(token)) {
    return res.status(401).json({
      success: false,
      message: "Student login required."
    });
  }

  req.student =
    studentSessions.get(token);

  next();
}


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
// ADMIN CARD SYSTEM
// ===============================

const cardsFile = path.join(__dirname, "cards.json");

if (!fs.existsSync(cardsFile)) {
  fs.writeFileSync(cardsFile, "[]");
}

app.get("/api/cards", (req, res) => {

  try {

    const cards =
      JSON.parse(
        fs.readFileSync(cardsFile, "utf8")
      );

    res.json({
      success: true,
      cards
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      success: false,
      message: "Cards load नहीं हो पाए।"
    });

  }

});

app.post("/api/admin/cards", requireAdmin, (req, res) => {

  try {

    const {
      title,
      icon,
      description,
      section,
      page
    } = req.body;

    if (!title || !section || !page) {

      return res.status(400).json({
        success: false,
        message: "Title, section और page जरूरी हैं।"
      });

    }

    const cards =
      JSON.parse(
        fs.readFileSync(cardsFile, "utf8")
      );

    const newCard = {
      id: crypto.randomBytes(8).toString("hex"),
      title: String(title).trim(),
      icon: String(icon || "📚").trim(),
      description: String(description || "").trim(),
      section: String(section).trim().toLowerCase(),
      page: String(page).trim(),
      createdAt: new Date().toISOString()
    };

    cards.push(newCard);

    fs.writeFileSync(
      cardsFile,
      JSON.stringify(cards, null, 2)
    );

    res.json({
      success: true,
      message: "New card successfully added.",
      card: newCard
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      success: false,
      message: "Card save नहीं हो पाया।"
    });

  }

});

app.delete(
  "/api/admin/cards/:id",
  requireAdmin,
  (req, res) => {

    try {

      const cards =
        JSON.parse(
          fs.readFileSync(cardsFile, "utf8")
        );

      const oldLength = cards.length;

      const updated =
        cards.filter(
          card => card.id !== req.params.id
        );

      if (updated.length === oldLength) {

        return res.status(404).json({
          success: false,
          message: "Card नहीं मिला।"
        });

      }

      fs.writeFileSync(
        cardsFile,
        JSON.stringify(updated, null, 2)
      );

      res.json({
        success: true,
        message: "Card deleted successfully."
      });

    } catch (error) {

      console.error(error);

      res.status(500).json({
        success: false,
        message: "Card delete नहीं हो पाया।"
      });

    }

  }
);


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
      "banking",
      "teaching",
      "armed-forces",
      "railway-exams",
      "banking-exams",
      "state-psc",
      "civil-defence",
      "law-professional",
      "insurance",
      "up-government",
      "university-law",
      "medical",
      "engineering",
      "research",
      "police-defence"
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
  requireStudent,
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
const PORT = process.env.PORT || 5000;

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

// ===============================
// MATERIALS GET
// ===============================

app.get("/api/materials/:section", (req, res) => {

  try {

    const section =
      String(req.params.section || "")
        .toLowerCase();

    const allowedSections = [
      "ba",
      "ma",
      "upsc",
      "uppcs",
      "net-jrf",
      "railway",
      "ssc",
      "banking",
      "teaching",
      "armed-forces",
      "railway-exams",
      "banking-exams",
      "state-psc",
      "civil-defence",
      "law-professional",
      "insurance",
      "up-government",
      "university-law",
      "medical",
      "engineering",
      "research",
      "police-defence"
    ];

    if (!allowedSections.includes(section)) {
      return res.status(400).json({
        success: false,
        message: "Invalid section"
      });
    }

    const folder = path.join(uploadsDir, section);

    if (!fs.existsSync(folder)) {
      return res.json({
        success: true,
        section,
        files: []
      });
    }

    const files = fs.readdirSync(folder).map(name => ({
      name,
      url:
        "/uploads/" +
        section +
        "/" +
        encodeURIComponent(name)
    }));

    res.json({
      success: true,
      section,
      files
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      success: false,
      message: "Materials load नहीं हो पाए।"
    });

  }

});


// ===============================
// ADMIN DELETE MATERIAL
// ===============================

app.delete(
  "/api/admin/materials/:section/:filename",
  requireAdmin,
  (req, res) => {

    try {

      const section =
        String(req.params.section || "")
          .toLowerCase();

      const filename =
        path.basename(req.params.filename || "");

      const allowedSections = [
        "ba",
        "ma",
        "upsc",
        "uppcs",
        "net-jrf",
        "railway",
        "ssc",
        "banking",
        "teaching",
        "armed-forces",
        "railway-exams",
        "banking-exams",
        "state-psc",
        "civil-defence",
        "law-professional",
        "insurance",
        "up-government",
        "university-law",
        "medical",
        "engineering",
        "research",
        "police-defence"
      ];

      if (!allowedSections.includes(section)) {
        return res.status(400).json({
          success: false,
          message: "Invalid section."
        });
      }

      if (!filename) {
        return res.status(400).json({
          success: false,
          message: "Invalid file."
        });
      }

      const filePath =
        path.join(
          uploadsDir,
          section,
          filename
        );

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({
          success: false,
          message: "File नहीं मिली।"
        });
      }

      fs.unlinkSync(filePath);

      res.json({
        success: true,
        message: "File successfully deleted.",
        file: filename,
        section: section
      });

    } catch (error) {

      console.error(error);

      res.status(500).json({
        success: false,
        message: "File delete नहीं हो पाई।"
      });

    }

  }
);


app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
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


      // ===============================
      // CHECK ALREADY REGISTERED USER
      // ===============================

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
            user.email.toLowerCase() === email.toLowerCase()
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


      const normalizedEmail = email.trim().toLowerCase();

      const existingUser = await pool.query(
        `SELECT id FROM students
         WHERE LOWER(email) = $1 OR mobile = $2
         LIMIT 1`,
        [normalizedEmail, mobile]
      );

      if (existingUser.rows.length > 0) {

        return res.status(400).json({

          success: false,

          message:
            "इस Email या Mobile से account पहले से मौजूद है।"

        });

      }

      const bcrypt = require("bcryptjs");

      const passwordHash =
        await bcrypt.hash(password, 10);

      const result = await pool.query(
        `INSERT INTO students
         (name, mobile, email, password)
         VALUES ($1, $2, $3, $4)
         RETURNING id, name, mobile, email, created_at`,
        [
          name.trim(),
          mobile,
          normalizedEmail,
          passwordHash
        ]
      );

      const newUser = result.rows[0];


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


      const normalizedEmail =
        email.trim().toLowerCase();

      const result = await pool.query(
        `SELECT id, name, mobile, email, password
         FROM students
         WHERE LOWER(email) = $1
         LIMIT 1`,
        [normalizedEmail]
      );

      if (result.rows.length === 0) {

        return res.status(401).json({

          success: false,

          message:
            "Email या Password गलत है।"

        });

      }

      const user = result.rows[0];

      const bcrypt = require("bcryptjs");

      const passwordMatch =
        await bcrypt.compare(
          password,
          user.password
        );

      if (!passwordMatch) {

        return res.status(401).json({

          success: false,

          message:
            "Email या Password गलत है।"

        });

      }

      const studentSession =
        generateStudentSession();

      studentSessions.set(
        studentSession,
        {
          id: user.id,
          name: user.name,
          mobile: user.mobile,
          email: user.email
        }
      );

      res.cookie(
        "studentSession",
        studentSession,
        {
          httpOnly: true,
          secure: true,
          sameSite: "none",
          maxAge: 24 * 60 * 60 * 1000,
          path: "/"
        }
      );

      res.json({

        success: true,

        message:
          "Login successful.",

        studentSession,

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


// STUDENT SESSION CHECK
app.get("/api/student/session", (req, res) => {

  const auth =
    req.headers.authorization || "";

  let token = "";

  if (auth.startsWith("Bearer ")) {
    token = auth.substring(7);
  }

  if (!token) {
    token =
      req.cookies.studentSession || "";
  }

  if (!token || !studentSessions.has(token)) {
    return res.status(401).json({
      success: false,
      loggedIn: false
    });
  }

  res.json({
    success: true,
    loggedIn: true,
    user: studentSessions.get(token)
  });
});


// ===============================
// STUDENT LOGOUT
// ===============================

app.post("/api/student/logout", (req, res) => {
  const token = req.cookies.studentSession;

  if (token) {
    studentSessions.delete(token);
  }

  res.clearCookie("studentSession", {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    path: "/"
  });

  res.json({
    success: true,
    message: "Logout successful."
  });
});


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
      "The Ravishankar Insights Backend running on http://0.0.0.0:$PORT"
    );

  }
);

