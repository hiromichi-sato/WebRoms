using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.Windows.Forms;

internal static class SplashTest
{
    [STAThread]
    private static int Main(string[] args)
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        using (var splash = new StartupSplash())
        {
            if (splash.ClientSize.Width != 480 || splash.ClientSize.Height != 260) throw new Exception("Unexpected splash dimensions.");
            splash.Show();
            Application.DoEvents();
            using (var bitmap = new Bitmap(480, 260))
            {
                splash.DrawToBitmap(bitmap, new Rectangle(0, 0, 480, 260));
                bitmap.Save(args[0], ImageFormat.Png);
                var header = bitmap.GetPixel(470, 10);
                if (header.R != 16 || header.G != 112 || bitmap.GetPixel(470, 250).R < 240) throw new Exception("Splash did not render.");
            }
            splash.Report("WEBROMS_STAGE:prepare");
            splash.Report("WEBROMS_STAGE:verify");
            splash.Report("WebROMS: http://127.0.0.1:5176/");
            splash.Report("WEBROMS_READY");
            var elapsed = Stopwatch.StartNew();
            splash.WaitForApplication(Process.GetCurrentProcess());
            if (elapsed.ElapsedMilliseconds > 3000) throw new Exception("Ready splash did not close.");
        }
        return 0;
    }
}
