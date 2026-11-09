/*
 * Apex Horizon driving and camera, the Turbo Royale way.
 *
 * Turbo Royale drives with a simple arcade model: speed goes up quickly with
 * the throttle, steering turns the car directly, the car's direction of travel
 * follows where it points almost instantly, and drifting (Space) lets it slide
 * so the direction of travel catches up slowly. The camera swings in behind
 * the car, pulls back with speed and boost, and leans into turns.
 *
 * Only the player's car uses this. AI rivals, traffic and party friends keep
 * the game's normal physics. The physics engine still handles gravity,
 * suspension, ramps and crashes - this script steers the car's speed and
 * heading on top of it every physics step.
 *
 * Hooks (see the patched index-*.js): window.__apexVP is set to the car class
 * prototype when the first car is made, the player's car gets __arcade = true,
 * and the chase camera calls window.__apexCam(camera, dt, car) each frame.
 */
(function () {
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function angDiff(a, b) { var d = a - b; return Math.atan2(Math.sin(d), Math.cos(d)); }
  function yawOf(body) {
    var q = body.rotation();
    return Math.atan2(2 * (q.x * q.z + q.w * q.y), 1 - 2 * (q.x * q.x + q.y * q.y));
  }

  // Turbo Royale-like numbers from the Apex car's own stats.
  function tune(v) {
    var s = v.stats;
    var h = clamp(1.6 + s.steer * 1.4 + (s.grip - 1) * 1.0, 1.9, 4.2);   // turn rate, rad/s
    return {
      top: s.topSpeed,                                                     // m/s
      accel: clamp(s.maxDriveForce / s.mass * 2.2, 25, 80),                // m/s^2
      h: h,
      dq: clamp((h - 1.9) / 2.3, 0, 1)                                     // better cars drift better
    };
  }

  function start(v) {
    var lv = v.body.linvel(), yaw = yawOf(v.body);
    v.__ar = { a: yaw, mv: yaw, sp: lv.x * Math.sin(yaw) + lv.z * Math.cos(yaw), str: 0, dr: false, bs: false };
  }

  // Before the game's own physics step: update speed and heading from the keys.
  function pre(v, dt) {
    if (!v.__ar) start(v);
    var st = v.__ar, c = tune(v), inp = v.input || {}, body = v.body;
    var lv = body.linvel();

    // Ran into something last step: lose the speed the crash took away.
    var along = lv.x * Math.sin(st.mv) + lv.z * Math.cos(st.mv);
    if (st.sp > 0 && along < st.sp - 3) st.sp = Math.max(-2, along);
    else if (st.sp < 0 && along > st.sp + 3) st.sp = Math.min(2, along);

    var air = v.groundedCount === 0;
    var up = inp.throttle > 0.05, dn = inp.brake > 0.05;
    var bs = !!inp.nitro && v.nitro > 0.02 && !v.locked;
    var sg = -(inp.steer || 0);                                           // + = left, like Turbo Royale

    if (v.locked) st.sp *= 1 - Math.min(1, dt * 6);
    else if (up || bs) st.sp += c.accel * (bs ? 2.4 : 1) * dt;
    else if (dn) st.sp -= c.accel * 1.8 * dt;
    else st.sp -= st.sp * 0.5 * dt;
    var cap = c.top * (bs ? 1.4 : 1);
    if (st.sp > cap) st.sp -= (st.sp - cap) * 3 * dt;
    if (st.sp < -14) st.sp = -14;

    var dr = !!inp.handbrake && st.sp > 22 && Math.abs(sg) > 0.05 && !air && !v.locked;
    st.dr = dr; st.str = sg; st.bs = bs;
    if (!v.locked) st.a += sg * c.h * (dr ? 1.25 + c.dq * 0.5 : 1) * dt * Math.min(1, Math.abs(st.sp) / 14) * (st.sp < 0 ? -1 : 1) * (air ? 0.4 : 1);
    st.mv += angDiff(st.a, st.mv) * Math.min(1, dt * (dr ? c.h * (1.6 + c.dq * 0.3) : (air ? 0.5 : 18)));
    if (dr) {
      st.sp -= st.sp * (0.2 - c.dq * 0.14) * dt;
      v.nitro = Math.min(1, v.nitro + dt * (0.12 + c.dq * 0.25));       // drifting fills up the boost
    }
  }

  // Average surface normal under the wheels (the road, a ramp, a roof), or straight up in the air.
  function groundNormal(v) {
    var x = 0, y = 0, z = 0, n = 0;
    (v.wheels || []).forEach(function (w) {
      if (w.grounded && w.hit && w.hit.normal) { x += w.hit.normal.x; y += w.hit.normal.y; z += w.hit.normal.z; n++; }
    });
    if (!n) return { x: 0, y: 1, z: 0 };
    var l = Math.hypot(x, y, z) || 1;
    return { x: x / l, y: y / l, z: z / l };
  }

  // After the game's physics step: drive the car where the arcade model says.
  function post(v, dt) {
    var st = v.__ar, body = v.body;
    if (!st) return;
    var q = body.rotation();
    var ux = 2 * (q.x * q.y - q.w * q.z), uy = 1 - 2 * (q.x * q.x + q.z * q.z), uz = 2 * (q.y * q.z + q.w * q.x);

    // Like Turbo Royale the car never stays on its roof: flip it back onto its wheels.
    if (uy < 0.2) {
      var t = body.translation();
      st.flip = (st.flip || 0) + dt;
      if (st.flip > 0.6) { st.flip = 0; v.reset({ x: t.x, y: t.y + 1.2, z: t.z }, st.a); return; }
    } else st.flip = 0;

    var lv = body.linvel();
    body.setLinvel({ x: Math.sin(st.mv) * st.sp, y: lv.y, z: Math.cos(st.mv) * st.sp }, true);

    // Keep the car flush with the road (and level in the air) instead of tumbling.
    var gn = groundNormal(v), k = 9;
    var cx = uy * gn.z - uz * gn.y, cz = ux * gn.y - uy * gn.x;
    var av = body.angvel(), err = angDiff(st.a, yawOf(body));
    body.setAngvel({ x: clamp(av.x * 0.7 + cx * k, -6, 6), y: clamp(err * 18, -9, 9), z: clamp(av.z * 0.7 + cz * k, -6, 6) }, true);
  }

  function install(proto) {
    if (!proto || proto.__turbo) return;
    proto.__turbo = true;
    var fixed = proto.fixedUpdate, reset = proto.reset;
    proto.fixedUpdate = function (dt) {
      if (!this.__arcade) return fixed.call(this, dt);
      pre(this, dt);
      var r = fixed.call(this, dt);
      post(this, dt);
      return r;
    };
    // Teleports and respawns start the arcade state fresh.
    proto.reset = function () { var r = reset.apply(this, arguments); this.__ar = null; return r; };
  }
  var vp = null;
  Object.defineProperty(window, '__apexVP', {
    configurable: true,
    get: function () { return vp; },
    set: function (p) { vp = p; install(p); }
  });

  // ---------- Turbo Royale chase camera ----------
  window.__apexCam = function (cam, dt, v) {
    if (cam.mode !== 0 && cam.mode !== 1) return false;    // hood / bumper views stay as they were
    var c = cam.camera, ar = v.__ar;
    if (!c || !v || !v.position) return false;
    var p = v.position, heading = ar ? ar.a : yawOf(v.body);
    var sp = ar ? ar.sp : v.speed || 0, str = ar ? ar.str : 0, dr = ar ? ar.dr : false;
    var bs = ar ? ar.bs : !!v.nitroActive, air = v.groundedCount === 0;
    var t = cam.__turbo;
    var zd = (cam.mode === 1 ? 14 : 11) + Math.min(1, Math.abs(sp) / 80) * 1.5 + (bs ? 4 : 0) + (air ? 5 : 0);
    var ty = p.y + 5.5 + (bs ? 1.5 : 0) + (air ? 3 : 0);
    if (!t || t.v !== v || p.distanceToSquared(t.last) > 1600) {
      t = cam.__turbo = { v: v, ca: heading, cs: 0, last: p.clone() };
      c.position.set(p.x - Math.sin(heading) * zd, ty, p.z - Math.cos(heading) * zd);
      c.fov = 66;
    }
    t.last.copy(p);
    t.ca += angDiff(heading, t.ca) * Math.min(1, dt * 7);
    t.cs += (str - t.cs) * Math.min(1, dt * 3);
    var target = c.position.clone().set(p.x - Math.sin(t.ca) * zd, ty, p.z - Math.cos(t.ca) * zd);
    c.position.lerp(target, Math.min(1, dt * 5));
    c.fov += ((bs || air ? 75 : 66) - c.fov) * Math.min(1, dt * 6);
    c.updateProjectionMatrix();
    var fx = Math.sin(heading), fz = Math.cos(heading), sh = t.cs * (dr ? 8 : 4);
    c.lookAt(p.x + fx * 6 + Math.cos(heading) * sh, p.y + 1.5, p.z + fz * 6 - Math.sin(heading) * sh);
    c.rotateZ(t.cs * (dr ? 0.04 : 0.02));
    return true;
  };
})();
