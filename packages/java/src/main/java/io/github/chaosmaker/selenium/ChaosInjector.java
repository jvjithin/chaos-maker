package io.github.chaosmaker.selenium;

import com.google.gson.Gson;
import org.openqa.selenium.JavascriptExecutor;
import org.openqa.selenium.WebDriver;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Map;

/**
 * ChaosInjector provides seamless integration between Chaos Maker and Selenium WebDriver.
 * This class allows you to inject chaos into your web application during automated testing.
 * 
 * <p>Example usage:</p>
 * <pre>{@code
 * WebDriver driver = new ChromeDriver();
 * Map<String, Object> config = new HashMap<>();
 * // ... configure chaos settings
 * ChaosInjector.inject(driver, config);
 * driver.get("https://your-app.com");
 * }</pre>
 */
public final class ChaosInjector {
    private static final String SCRIPT_CONTENT = loadScriptFromResources();
    private static final Gson GSON = new Gson();

    private ChaosInjector() {
        // Utility class - prevent instantiation
    }

    /**
     * Injects Chaos Maker into the given WebDriver instance.
     * 
     * @param driver the WebDriver instance to inject chaos into
     * @param config the chaos configuration map
     * @throws RuntimeException if the script cannot be loaded or executed
     */
    public static void inject(WebDriver driver, Map<String, Object> config) {
        String configJson = GSON.toJson(config);
        String scriptToExecute = "window.__CHAOS_CONFIG__ = " + configJson + "; " + SCRIPT_CONTENT;
        
        ((JavascriptExecutor) driver).executeScript(scriptToExecute);
    }

    /**
     * Injects Chaos Maker after the page has loaded.
     * Useful when you need to inject chaos after navigation.
     * 
     * @param driver the WebDriver instance to inject chaos into
     * @param config the chaos configuration map
     */
    public static void injectAfterLoad(WebDriver driver, Map<String, Object> config) {
        inject(driver, config);
    }

    /**
     * Loads the Chaos Maker script from the JAR resources.
     * 
     * @return the script content as a string
     * @throws RuntimeException if the script cannot be loaded
     */
    private static String loadScriptFromResources() {
        try (InputStream is = ChaosInjector.class.getResourceAsStream("/chaos-maker.umd.js")) {
            if (is == null) {
                throw new IllegalStateException("Cannot find chaos-maker.umd.js in JAR resources.");
            }
            return new String(is.readAllBytes(), StandardCharsets.UTF_8);
        } catch (Exception e) {
            throw new RuntimeException("Failed to load Chaos Maker script.", e);
        }
    }
}
