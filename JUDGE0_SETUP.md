# Judge0 setup for Round 3 (run and score students' code)

Round 3 needs a **Judge0** server. It runs students' Python, Java and C programs inside a sandbox, away from your
computer and your database password. Judge0 only runs on **Linux**, so on Windows you run it inside an Ubuntu virtual machine.

Ready-made files are in the `judge0` folder: `docker-compose.yml` and `judge0.conf`.

> These steps were written from Judge0's documentation and user reports. They could not be tested on a real machine while
> preparing this project. **Do the whole setup and the check in step 6 at least a week before the event.**

---

## Choose where Judge0 will run

| Choice | Good for | Notes |
|---|---|---|
| **A. Ubuntu virtual machine (VirtualBox) on a Windows PC** | Most people | Most reliable on Windows. Needs 4 GB RAM free for the VM, 8 GB is better. |
| **B. A spare PC or laptop with Ubuntu installed** | A lab | Best performance. Use the Linux steps from step 3. |
| **C. Docker Desktop + WSL2 on Windows** | Trying it quickly | Often fails because Judge0 needs the old "cgroup v1" mode. Try only if A is not possible. |

For about 100 students use a machine with **4 CPU cores and 8 GB RAM** or more.

---

## Step 1: create the Ubuntu VM (choice A)

1. Install **VirtualBox** from virtualbox.org and download the **Ubuntu 22.04 LTS Desktop ISO** from ubuntu.com.
2. In VirtualBox: **New**, give it **4 CPUs, 8192 MB RAM, 40 GB disk**, and choose the ISO. Install Ubuntu with the defaults.
3. Settings → Network → Adapter 1 → **Bridged Adapter**. This gives the VM its own address on your Wi-Fi/LAN so other computers can reach it.
4. Start Ubuntu, log in and open **Terminal**.

## Step 2: turn on cgroup v1 (needed by Judge0)

Judge0 needs the older cgroup v1. Without it you get errors like `No such file or directory @ rb_sysopen - /box/script.py`.

```
sudo nano /etc/default/grub
```
Find the line `GRUB_CMDLINE_LINUX=""` and change it to:
```
GRUB_CMDLINE_LINUX="systemd.unified_cgroup_hierarchy=0 SYSTEMD_CGROUP_ENABLE_LEGACY_FORCE=1"
```
Save (Ctrl+O, Enter, Ctrl+X), then:
```
sudo update-grub
sudo reboot
```

## Step 3: install Docker

After the reboot, in Terminal:
```
sudo apt update
sudo apt install -y docker.io docker-compose-v2 git
sudo systemctl enable --now docker
```

## Step 4: copy the `judge0` folder into the VM

Copy the `judge0` folder from this project into the VM (drag and drop with VirtualBox shared folders, a USB stick, or download the project zip inside the VM).

Open `judge0/judge0.conf` and **change the three secrets**: `REDIS_PASSWORD`, `POSTGRES_PASSWORD` and `AUTHN_TOKEN`. Write the `AUTHN_TOKEN` down, you need it in step 5.

Start Judge0:
```
cd judge0
sudo docker compose up -d db redis
sleep 15
sudo docker compose up -d
```
Wait about a minute, then check: `sudo docker compose ps` should show `server`, `worker`, `db` and `redis` as running.

Find the VM's address:
```
ip a
```
Look for something like `inet 192.168.1.45/24` on the main network adapter. That is `VM_IP`.

Test from the VM: open `http://localhost:2358/docs` in the browser. You should see the Judge0 API page (it asks for the token header).

**Open the port** if another computer cannot reach it: `sudo ufw allow 2358/tcp` (only if ufw is on).

## Step 5: connect the project

In `server\.env` on your competition computer add:
```
JUDGE0_URL=http://VM_IP:2358
JUDGE0_AUTH_TOKEN=the-same-AUTHN_TOKEN-you-put-in-judge0.conf
```
Save and restart the server (`Ctrl+C`, then `npm run dev`). The Admin → Live overview should now say **Code judging: automatic (Judge0)**.

## Step 6: check it works

In a terminal in the `server` folder:
```
npm run check:judge
```
It runs small Python, Java and C programs (correct, wrong and broken) and prints a tick or a cross for each check. All lines must show ✔.
Then log in as a test student, start Round 3 in Python and press **Run code** and **Submit code**.

## Several students at once

- Add more workers so more programs run in parallel: `sudo docker compose up -d --scale worker=4` (use roughly one worker per CPU core).
- `MAX_QUEUE_SIZE` in `judge0.conf` is already raised to 2000, so a rush of submissions is queued instead of rejected.
- Try a mock Round 3 with 20 to 30 students pressing Run together before the real event.

## Troubleshooting

| Problem | Fix |
|---|---|
| `/box/script.py` or `/box/Main.java` not found, or every run says "Internal error" | cgroup v1 is not active. Redo step 2, reboot, and check with `stat -fc %T /sys/fs/cgroup/` (it must print `tmpfs`, not `cgroup2fs`). |
| `docker compose` not found | Install `docker-compose-v2` (step 3) or use `docker-compose` with a hyphen. |
| The project says "Could not reach the runner" | Check `JUDGE0_URL`, that both machines are on the same network, the port 2358 is open, and Judge0 is running. |
| `Judge server answered 403` | `JUDGE0_AUTH_TOKEN` in `server/.env` is not the same as `AUTHN_TOKEN` in `judge0.conf`. Restart both after changing. |
| `Judge server answered 503` or "queue is full" | Add workers (above) and check `MAX_QUEUE_SIZE`. |
| Java fails with "class Main not found" | The student's class must be named `Main`. |
| It worked, then stopped after a restart | `sudo docker compose up -d` in the `judge0` folder. Services restart by themselves when Docker starts. |

## Choice C: Docker Desktop + WSL2 (try only if you cannot use a VM)

Create `C:\Users\YOUR_NAME\.wslconfig`:
```
[wsl2]
kernelCommandLine = systemd.unified_cgroup_hierarchy=0
memory=6GB
processors=4
```
Run `wsl --shutdown` in PowerShell, restart Docker Desktop, then in the `judge0` folder run the two `docker compose up` commands from step 4 (use `localhost` as `VM_IP`).
Users report this often does not work because the WSL2 kernel uses cgroup v2. If runs fail with `/box/...` errors, use choice A.

## If you cannot get Judge0 working

Leave `JUDGE0_URL` empty. Round 3 then saves the students' code, Python students can still use Run code (it runs in their browser), and you give the marks in Admin → Participants → View / grade.
