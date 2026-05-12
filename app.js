app.use(async (req, res, next) => {
    const auth = req.cookies.auth;

    if (!authValid(auth)) {
        if (req.path !== "/" &&
            !req.path.startsWith("/secure") &&
            !req.path.startsWith("/assets")) {

            return res.redirect("/");
        }
    }

    next();
});
app.post("/secure/submit", (req, res) => {
    if (req.body.code === process.env.PASSWORD) {
        res.cookie("auth", createToken(), {
            httpOnly: true,
            secure: true,
            sameSite: "strict"
        });

        return res.json({ success: true });
    }

    res.json({ success: false });
});
app.get("*", (req, res) => {
    if (!authenticated(req)) {
        return res.redirect("/");
    }

    res.sendFile("protected/index.html");
});