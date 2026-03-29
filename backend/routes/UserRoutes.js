const express = require("express");
const router  = express.Router();
const { registerUser, getUserByUid, getAllUsers } = require("../controllers/UserController");

router.post("/register", registerUser);
router.get("/:uid",      getUserByUid);
router.get("/",          getAllUsers);

module.exports = router;