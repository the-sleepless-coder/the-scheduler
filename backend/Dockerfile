FROM eclipse-temurin:21-jdk AS build
WORKDIR /app
COPY gradlew settings.gradle.kts build.gradle.kts ./
COPY gradle gradle
COPY src src
# Optional settings for builders that reach Maven Central through a corporate proxy.
ARG JAVA_TOOL_OPTIONS
RUN --mount=type=secret,id=gradle_proxy_ca \
    if [ -f /run/secrets/gradle_proxy_ca ]; then \
        keytool -importcert -noprompt -cacerts -storepass changeit \
            -alias gradle-proxy-ca -file /run/secrets/gradle_proxy_ca || exit 1; \
    fi && ./gradlew --no-daemon bootJar

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /app/build/libs/scheduler.jar scheduler.jar
USER 10001
EXPOSE 5004
ENTRYPOINT ["java", "-jar", "scheduler.jar"]
