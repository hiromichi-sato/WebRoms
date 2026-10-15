using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Windows.Forms;

[assembly: AssemblyTitle("WebROMS Launcher")]
[assembly: AssemblyDescription("Open the WebROMS application in this folder")]
[assembly: AssemblyProduct("WebROMS")]
[assembly: AssemblyVersion("1.0.0.0")]

internal static class Launcher
{
    [STAThread]
    private static int Main(string[] args)
    {
        try
        {
            string root = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
            string script = Path.Combine(root, "scripts", "windows-launcher", "start-webroms.ps1");
            if (!File.Exists(script)) throw new FileNotFoundException("Keep the complete WebROMS folder together. Missing start-webroms.ps1.");
            string arguments = "-NoLogo -NoProfile -ExecutionPolicy Bypass -File \"" + script + "\"";
            for (int i = 0; i < args.Length; i++)
            {
                if (String.Equals(args[i], "-NoBrowser", StringComparison.OrdinalIgnoreCase)) arguments += " -NoBrowser";
                else if (String.Equals(args[i], "-Port", StringComparison.OrdinalIgnoreCase))
                {
                    int port;
                    if (++i >= args.Length || !Int32.TryParse(args[i], out port) || port < 1024 || port > 65400) throw new ArgumentException("Port must be between 1024 and 65400.");
                    arguments += " -Port " + port;
                }
                else throw new ArgumentException("Supported options: -Port <number>, -NoBrowser");
            }
            bool headless = Array.Exists(args, value => String.Equals(value, "-NoBrowser", StringComparison.OrdinalIgnoreCase));
            if (!headless) { Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false); }
            ProcessStartInfo info = new ProcessStartInfo {
                FileName = Path.Combine(Environment.SystemDirectory, "WindowsPowerShell", "v1.0", "powershell.exe"),
                Arguments = arguments, WorkingDirectory = root, UseShellExecute = false,
                WindowStyle = ProcessWindowStyle.Hidden,
                CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true
            };
            using (StartupSplash splash = headless ? null : new StartupSplash())
            {
                if (splash != null) { splash.Show(); Application.DoEvents(); }
                using (Process process = Process.Start(info))
                {
                string diagnostic = "";
                process.OutputDataReceived += delegate(object sender, DataReceivedEventArgs data) {
                    if (data.Data == null) return;
                    diagnostic = data.Data;
                    if (headless) Console.WriteLine(data.Data);
                    else splash.Report(data.Data);
                };
                process.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs data) { if (data.Data != null) { diagnostic = data.Data; if (headless) Console.Error.WriteLine(data.Data); } };
                process.BeginOutputReadLine(); process.BeginErrorReadLine();
                if (splash != null) splash.WaitForApplication(process);
                process.WaitForExit();
                if (process.ExitCode != 0 && !headless) throw new Exception("WebROMS could not start.\n" + diagnostic);
                return process.ExitCode;
                }
            }
        }
        catch (Exception error)
        {
            MessageBox.Show(error.Message + "\n\nSee WINDOWS.md.", "WebROMS could not start", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        }
    }
}

internal sealed class StartupSplash : Form
{
    private readonly Label status;
    private volatile string stage = "\u8d77\u52d5\u306e\u6e96\u5099\u3092\u3057\u3066\u3044\u307e\u3059";
    private volatile bool ready;

    internal StartupSplash()
    {
        AutoScaleMode = AutoScaleMode.Dpi;
        ClientSize = new Size(480, 260);
        StartPosition = FormStartPosition.CenterScreen;
        FormBorderStyle = FormBorderStyle.None;
        BackColor = Color.White;
        ShowInTaskbar = true;
        Text = "WebROMS";
        Icon = Icon.ExtractAssociatedIcon(Assembly.GetExecutingAssembly().Location);
        Font = new Font("Yu Gothic UI", 11);
        var header = new Panel { Dock = DockStyle.Top, Height = 112, BackColor = Color.FromArgb(16, 112, 109) };
        header.Controls.Add(new PictureBox { Location = new Point(26, 22), Size = new Size(68, 68), Image = Icon.ToBitmap(), SizeMode = PictureBoxSizeMode.Zoom });
        header.Controls.Add(new Label { Text = "WebROMS", Location = new Point(112, 22), AutoSize = true, ForeColor = Color.White, Font = new Font("Segoe UI", 29, FontStyle.Bold) });
        header.Controls.Add(new Label { Text = "Ocean Modeling Platform", Location = new Point(115, 76), AutoSize = true, ForeColor = Color.White, Font = new Font("Segoe UI", 10) });
        Controls.Add(header);
        Controls.Add(new Label { Text = "WebROMS\u3092\u8d77\u52d5\u4e2d", Location = new Point(28, 132), AutoSize = true, Font = new Font("Yu Gothic UI", 16, FontStyle.Bold), ForeColor = Color.FromArgb(25, 43, 48) });
        status = new Label { Text = stage, Location = new Point(30, 175), Size = new Size(420, 27), ForeColor = Color.FromArgb(75, 91, 96) };
        Controls.Add(status);
        Controls.Add(new ProgressBar { Location = new Point(30, 218), Size = new Size(420, 7), Style = ProgressBarStyle.Marquee, MarqueeAnimationSpeed = 28 });
    }

    internal void Report(string line)
    {
        if (line == "WEBROMS_STAGE:prepare") stage = "\u30a2\u30d7\u30ea\u306e\u30d5\u30a1\u30a4\u30eb\u3092\u6e96\u5099\u3057\u3066\u3044\u307e\u3059";
        else if (line == "WEBROMS_STAGE:verify") stage = "\u8a08\u7b97\u30a8\u30f3\u30b8\u30f3\u3068\u30c7\u30fc\u30bf\u3092\u78ba\u8a8d\u3057\u3066\u3044\u307e\u3059";
        else if (line.StartsWith("WebROMS: http:")) stage = "\u30d6\u30e9\u30a6\u30b6\u30fc\u3067\u753b\u9762\u3092\u958b\u3044\u3066\u3044\u307e\u3059";
        else if (line == "WEBROMS_READY") ready = true;
    }

    internal void WaitForApplication(Process process)
    {
        using (var timer = new System.Windows.Forms.Timer { Interval = 100 })
        {
            timer.Tick += delegate { status.Text = stage; if (ready || process.HasExited) Close(); };
            timer.Start();
            Application.Run(this);
        }
    }
}
